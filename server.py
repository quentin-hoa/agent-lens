#!/usr/bin/env python3
"""agent-lens : live, read-only web view of Claude Code agents and workflows.

Finds every Claude Code session on this machine that launched agents or workflows
(~/.claude/projects/<project>/<session>/subagents/) and serves a local page on
127.0.0.1 to inspect them: prompts, tool calls, results, timeline. Nothing is written
to ~/.claude and nothing leaves the machine.

    python3 server.py              start in the background and open the browser
    python3 server.py stop         stop it
    python3 server.py restart      restart it
    python3 server.py --foreground keep it in the terminal (Ctrl+C to stop)
"""
import argparse
import base64
import glob
import gzip
import json
import os
import re
import signal
import sys
import threading
import time
import urllib.request
import webbrowser
from collections import Counter
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PROJECTS = os.path.join(os.path.expanduser('~'), '.claude', 'projects')
HERE = os.path.dirname(os.path.realpath(__file__))
DIST = os.path.join(HERE, 'web', 'dist')   # interface React compilée (cd web && npm run build)
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
        '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json'}
NOT_BUILT = ('<!doctype html><meta charset="utf-8"><title>Agents</title><body style="font:15px system-ui;'
             'background:#0b0b0d;color:#ececef;padding:48px"><h1 style="font-size:20px">Interface not built</h1>'
             f'<p>Run <code>cd {os.path.join(HERE, "web")} &amp;&amp; npm install &amp;&amp; npm run build</code>, '
             'then reload this page.</p>')
PIDFILE = os.path.join(HERE, '.agents-panel.pid')
LOGFILE = os.path.join(HERE, 'agents-panel.log')
DEFAULT_PORT = 8765

WF_RE = re.compile(r'^wf_[A-Za-z0-9_-]{3,80}$')
SESSION_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
SRC_RE = re.compile(r'^(wf_[A-Za-z0-9_-]{3,80}|s_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
AG_RE = re.compile(r'^a[0-9a-f]{6,40}$')
TU_RE = re.compile(r'^[A-Za-z0-9_-]{6,120}$')

INLINE_LIMIT = 6000      # caractères d'un résultat d'outil envoyés d'office (le reste à la demande)
INPUT_LIMIT = 20000      # caractères d'une chaîne d'entrée d'outil (ex. contenu d'un Write)
FEED_SIZE = 80           # actions récentes dans le fil global
CONTEXT_BLOBS = 8        # blocs de contexte injecté gardés par agent (CLAUDE.md, rappels)
STALE_AFTER = 15 * 60    # agent « inactif » après 15 min sans rien écrire
STALLED_AFTER = 20 * 60  # workflow « à l'arrêt » après 20 min sans activité
LIVE_WINDOW = 150        # une session est « active » si un fichier a bougé il y a moins de 2 min 30

# Agents prévus par phase pour des workflows connus (facultatif) : expected.json à côté de ce fichier,
# {"nom-du-workflow": {"Phase": [min, max], ...}}. Voir expected.example.json.
EXPECTED = (lambda p: json.load(open(p, encoding='utf-8')) if os.path.isfile(p) else {})(
    os.path.join(HERE, 'expected.json'))


# ---------------------------------------------------------------- utilitaires

def epoch(s):
    if not s or not isinstance(s, str):
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0


def split_relay(text):
    """'[Workflow harness — …] en-tête…\\n  ligne\\n  ligne' -> (en-tête, corps sans l'indentation)."""
    head, _, body = text.partition('\n')
    lines = [line[2:] if line.startswith('  ') else line for line in body.split('\n')]
    return head, '\n'.join(lines).strip('\n')


def clip(v):
    if isinstance(v, str):
        return v if len(v) <= INPUT_LIMIT else v[:INPUT_LIMIT] + f'\n… [{len(v)} caractères au total]'
    if isinstance(v, list):
        return [clip(x) for x in v]
    if isinstance(v, dict):
        return {k: clip(x) for k, x in v.items()}
    return v


def content_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return '\n'.join(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
    return ''


def tool_summary(name, inp):
    if not isinstance(inp, dict):
        return ''

    def get(k):
        return str(inp.get(k) or '')

    if name == 'WebSearch':
        return get('query')
    if name == 'WebFetch':
        return get('url')
    if name in ('Read', 'Write', 'Edit', 'NotebookEdit'):
        return get('file_path')
    if name == 'Bash':
        return get('description') or get('command')
    if name in ('Grep', 'Glob'):
        return (get('pattern') + ('   dans ' + get('path') if inp.get('path') else '')).strip()
    if name == 'ToolSearch':
        return get('query')
    if name == 'StructuredOutput':
        return 'résultat final structuré'
    if name in ('Agent', 'Task'):
        return get('description')
    return json.dumps(inp, ensure_ascii=False)[:200]


def hook_note(a):
    out = a.get('stdout') or a.get('content') or ''
    try:
        spec = (json.loads(out) or {}).get('hookSpecificOutput') or {}
        cmd = (spec.get('updatedInput') or {}).get('command')
        reason = spec.get('permissionDecisionReason') or ''
        if cmd:
            return f'{reason or "réécrit"} → {cmd}'
        if reason:
            return reason
    except (ValueError, AttributeError, TypeError):
        pass
    return str(out)[:400]


def journal_status(t):
    t = (t or '').lower()
    if any(k in t for k in ('error', 'fail', 'abort', 'kill')):
        return 'error'
    if 'skip' in t:
        return 'skipped'
    if any(k in t for k in ('complete', 'done', 'finish', 'result', 'cached', 'success', 'end')):
        return 'done'
    return None


def read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def parse_meta(src):
    """Lit name / description / phases dans 'export const meta = {…}' (littéral JS pur)."""
    m = re.search(r'export\s+const\s+meta\s*=\s*\{', src)
    if not m:
        return None
    i = m.end() - 1
    depth, j, q = 0, i, None
    while j < len(src):
        ch = src[j]
        if q:
            if ch == '\\':
                j += 2
                continue
            if ch == q:
                q = None
        elif ch in '\'"`':
            q = ch
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    block = src[i:j + 1]
    strq = r"""(['"`])((?:\\.|(?!\1).)*)\1"""

    def val(key):
        mm = re.search(r'\b' + key + r'\s*:\s*' + strq, block, re.S)
        return mm.group(2) if mm else None

    phases = []
    for pm in re.finditer(r'\{\s*title\s*:\s*' + strq + r'(.*?)\}', block, re.S):
        dm = re.search(r'detail\s*:\s*' + strq, pm.group(3), re.S)
        phases.append({'title': pm.group(2), 'detail': dm.group(2) if dm else ''})
    return {'name': val('name'), 'description': val('description'), 'phases': phases}


def short_home(path):
    home = os.path.expanduser('~')
    if path and path.startswith(home):
        return '~' + path[len(home):]
    return path or ''


# ---------------------------------------------------------------- titre d'une session

_TITLE_RES = [re.compile(rb'"customTitle"\s*:\s*"((?:[^"\\]|\\.)*)"'),
              re.compile(rb'"aiTitle"\s*:\s*"((?:[^"\\]|\\.)*)"')]
_CWD_RE = re.compile(rb'"cwd"\s*:\s*"((?:[^"\\]|\\.)*)"')
_session_cache = {}
_session_lock = threading.Lock()


def _jstr(raw):
    try:
        return json.loads(b'"' + raw + b'"')
    except ValueError:
        return raw.decode('utf-8', 'replace')


def session_meta(main_path, fallback_file=None):
    """{title, cwd, first_prompt} d'une session, lu au début et à la fin du transcript principal."""
    path = main_path if main_path and os.path.exists(main_path) else fallback_file
    if not path:
        return {}
    try:
        st = os.stat(path)
    except OSError:
        return {}
    key = (path, st.st_size, st.st_mtime)
    with _session_lock:
        if _session_cache.get(path, (None,))[0] == key:
            return _session_cache[path][1]
    meta = {'title': None, 'cwd': None, 'first_prompt': None}
    try:
        with open(path, 'rb') as f:
            head = f.read(400_000)
            if st.st_size > 800_000:
                f.seek(st.st_size - 600_000)
            else:
                f.seek(0)
            tail = f.read()
    except OSError:
        return {}
    for rx in _TITLE_RES:
        found = rx.findall(tail) or rx.findall(head)
        if found:
            meta['title'] = _jstr(found[-1])
            break
    m = _CWD_RE.search(head)
    if m:
        meta['cwd'] = _jstr(m.group(1))
    for raw in head.split(b'\n'):
        if b'"type":"user"' not in raw[:200] and b'"type": "user"' not in raw[:200]:
            continue
        try:
            o = json.loads(raw)
        except ValueError:
            continue
        if o.get('isMeta'):
            continue
        c = content_text((o.get('message') or {}).get('content'))
        if c.strip() and not c.lstrip().startswith(('<', '[Workflow harness', 'Caveat:')):
            meta['first_prompt'] = c.strip()[:300]
            break
    with _session_lock:
        _session_cache[path] = (key, meta)
    return meta


# ---------------------------------------------------------------- un agent

class AgentLog:
    """Lecture incrémentale de agent-<id>.jsonl (fichier en ajout seul)."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.reset()

    def reset(self):
        self.offset = 0
        self.events = []
        self.cards = {}           # tool_use_id -> index de l'événement 'tool'
        self.so_inputs = {}       # tool_use_id -> entrée complète de StructuredOutput
        self.images = []          # (media_type, base64)
        self.full = {}            # tool_use_id -> texte complet du résultat (si tronqué)
        self.usage = {}           # id du message -> usage
        self.first = None
        self.last = None
        self.model = None
        self.effort = None
        self.requests = 0
        self.system = None
        self.tools = None
        self.context = []
        self.prompt = None
        self.prompt_head = None
        self.request = None
        self.result = None
        self.result_text = None
        self.so_ok = False
        self.last_stop = None
        self.pending = set()
        self.errors = 0
        self.by_tool = Counter()
        self.domains = Counter()
        self.actions = []         # (ts, index, outil, résumé)
        self.thinking_ms = 0
        self.search = []          # (index, texte) pour la recherche plein texte

    def update(self):
        try:
            size = os.path.getsize(self.path)
        except OSError:
            return
        with self.lock:
            if size < self.offset:
                self.reset()
            if size == self.offset:
                return
            with open(self.path, 'rb') as f:
                f.seek(self.offset)
                data = f.read(size - self.offset)
            end = data.rfind(b'\n')
            if end < 0:
                return
            self.offset += end + 1
            for raw in data[:end].split(b'\n'):
                if not raw.strip():
                    continue
                if b'"api-request-blob"' in raw[:60] and len(self.context) >= CONTEXT_BLOBS:
                    continue
                try:
                    o = json.loads(raw)
                except ValueError:
                    continue
                try:
                    self._ingest(o)
                except Exception as exc:  # une ligne bizarre ne doit pas casser le panneau
                    self._add({'k': 'sys', 't': None, 'sub': 'erreur de lecture', 'text': repr(exc)[:300]})

    def _add(self, ev, search_text=None):
        ev['i'] = len(self.events)
        self.events.append(ev)
        if search_text:
            self.search.append((ev['i'], search_text))
        return ev['i']

    def _ingest(self, o):
        t = o.get('type')
        ts = epoch(o.get('timestamp'))
        if ts:
            self.first = ts if self.first is None else min(self.first, ts)
            self.last = ts if self.last is None else max(self.last, ts)
        if t == 'user':
            self._user(o, ts)
        elif t == 'assistant':
            self._assistant(o, ts)
        elif t == 'attachment':
            self._attachment(o, ts)
        elif t == 'api-request':
            self.requests += 1
            p = o.get('params') or {}
            self.model = p.get('model') or self.model
            self.effort = (p.get('output_config') or {}).get('effort') or self.effort
        elif t == 'api-request-shape':
            if self.system is None:
                shape = o.get('shape') or {}
                self.system = [b.get('text', '') for b in shape.get('system') or [] if isinstance(b, dict)]
                self.tools = [{'name': x.get('name'), 'description': (x.get('description') or '')[:6000]}
                              for x in shape.get('tools') or [] if isinstance(x, dict)]
        elif t == 'api-request-blob':
            if len(self.context) < CONTEXT_BLOBS:
                m = o.get('message') or {}
                text = content_text(m.get('content'))
                if text:
                    self.context.append({'role': m.get('role'), 'text': text[:30000]})
        else:
            self._add({'k': 'sys', 't': ts, 'sub': str(t), 'text': json.dumps(o, ensure_ascii=False)[:800]})

    def _result_content(self, content):
        if isinstance(content, str):
            return content, []
        parts, imgs = [], []
        for b in content or []:
            if not isinstance(b, dict):
                continue
            bt = b.get('type')
            if bt == 'text':
                parts.append(b.get('text', ''))
            elif bt == 'image':
                src = b.get('source') or {}
                if src.get('type') == 'base64' and src.get('data'):
                    self.images.append((src.get('media_type') or 'image/png', src['data']))
                    imgs.append(len(self.images) - 1)
                    parts.append('[image]')
            elif bt == 'tool_reference':
                parts.append('outil chargé : ' + str(b.get('tool_name') or b.get('name') or ''))
            else:
                parts.append(json.dumps(b, ensure_ascii=False)[:3000])
        return '\n'.join(parts), imgs

    def _user(self, o, ts):
        c = (o.get('message') or {}).get('content')
        if isinstance(c, list) and self.prompt is None and not any(
                isinstance(b, dict) and b.get('type') == 'tool_result' for b in c):
            c = content_text(c) or c
        if isinstance(c, str):
            if c.startswith('[Workflow harness — computed task]'):
                self.prompt_head, self.prompt = split_relay(c)
                self._add({'k': 'prompt', 't': ts, 'chars': len(self.prompt)}, self.prompt)
            elif c.startswith('[Workflow harness — user request]'):
                self.request = split_relay(c)[1]
            elif self.prompt is None and not o.get('isMeta'):
                # agent lancé hors workflow : son premier message est son prompt
                self.prompt = c
                self._add({'k': 'prompt', 't': ts, 'chars': len(c)}, c)
            else:
                self._add({'k': 'user', 't': ts, 'text': c[:INLINE_LIMIT * 2]}, c)
            return
        for b in c or []:
            if not isinstance(b, dict):
                continue
            bt = b.get('type')
            if bt == 'tool_result':
                tid = b.get('tool_use_id')
                text, imgs = self._result_content(b.get('content'))
                err = bool(b.get('is_error'))
                if err:
                    self.errors += 1
                self.pending.discard(tid)
                idx = self.cards.get(tid)
                start = self.events[idx].get('t') if idx is not None else None
                name = self.events[idx].get('name') if idx is not None else None
                ev = {'k': 'result', 't': ts, 'id': tid, 'err': err, 'text': text[:INLINE_LIMIT], 'img': imgs,
                      'ms': int((ts - start) * 1000) if ts and start else None}
                if len(text) > INLINE_LIMIT:
                    ev['trunc'] = len(text)
                    self.full[tid] = text
                self._add(ev, text)
                if name == 'StructuredOutput' and not err:
                    self.so_ok = True
                    self.result = self.so_inputs.get(tid)
            elif bt == 'text':
                txt = b.get('text', '')
                self._add({'k': 'user', 't': ts, 'text': txt[:INLINE_LIMIT * 2]}, txt)
            elif bt == 'image':
                _, imgs = self._result_content([b])
                self._add({'k': 'user', 't': ts, 'text': '[image]', 'img': imgs})

    def _assistant(self, o, ts):
        m = o.get('message') or {}
        mid = m.get('id')
        if mid and isinstance(m.get('usage'), dict):
            self.usage[mid] = m['usage']
        self.model = m.get('model') or self.model
        self.effort = o.get('effort') or self.effort
        if m.get('stop_reason'):
            self.last_stop = m.get('stop_reason')
        for b in m.get('content') or []:
            if not isinstance(b, dict):
                continue
            bt = b.get('type')
            if bt in ('thinking', 'redacted_thinking'):
                ms = o.get('thinkingDurationMs') or 0
                self.thinking_ms += ms
                txt = b.get('thinking') or ''
                self._add({'k': 'thinking', 't': ts, 'ms': ms, 'text': txt[:INLINE_LIMIT]}, txt or None)
            elif bt == 'text':
                txt = b.get('text') or ''
                if txt.strip():
                    self._add({'k': 'text', 't': ts, 'text': txt}, txt)
                    self.result_text = txt
            elif bt == 'tool_use':
                name = b.get('name') or '?'
                inp = b.get('input')
                tid = b.get('id')
                if name == 'StructuredOutput':
                    self.so_inputs[tid] = inp
                if name == 'WebFetch' and isinstance(inp, dict) and inp.get('url'):
                    self.domains[urlparse(str(inp['url'])).netloc.lower().removeprefix('www.')] += 1
                self.by_tool[name] += 1
                self.pending.add(tid)
                summ = tool_summary(name, inp)
                idx = self._add({'k': 'tool', 't': ts, 'id': tid, 'name': name, 'input': clip(inp), 'sum': summ[:300]},
                                name + ' ' + json.dumps(inp, ensure_ascii=False))
                self.cards[tid] = idx
                self.actions.append((ts, idx, name, summ[:200]))

    def _attachment(self, o, ts):
        a = o.get('attachment') or {}
        sub = a.get('type') or '?'
        if sub.startswith('hook') and a.get('toolUseID'):
            self._add({'k': 'hook', 't': ts, 'id': a.get('toolUseID'), 'name': a.get('hookName') or sub,
                       'text': hook_note(a)})
        else:
            self._add({'k': 'sys', 't': ts, 'sub': sub, 'text': json.dumps(a, ensure_ascii=False)[:1500]})

    def finished(self):
        return self.so_ok or (self.last_stop == 'end_turn' and not self.pending)

    def tokens(self):
        u = Counter()
        for x in self.usage.values():
            u['in'] += x.get('input_tokens') or 0
            u['cache_write'] += x.get('cache_creation_input_tokens') or 0
            u['cache_read'] += x.get('cache_read_input_tokens') or 0
            u['out'] += x.get('output_tokens') or 0
        return dict(u)

    def header(self):
        return {
            'first': self.first, 'last': self.last, 'model': self.model, 'effort': self.effort,
            'requests': self.requests, 'tools': sum(self.by_tool.values()), 'by_tool': dict(self.by_tool),
            'errors': self.errors, 'tokens': self.tokens(), 'thinking_ms': self.thinking_ms,
            'finished': self.finished(), 'events': len(self.events), 'pending': len(self.pending),
            'has_result': self.result is not None or (self.finished() and bool(self.result_text)),
        }


# ---------------------------------------------------------------- une source : un workflow ou les agents d'une session

class Source:
    def __init__(self, info):
        self.info = info
        self.kind = info['kind']
        self.lock = threading.Lock()
        self.joffset = 0
        self.jevents = []
        self.wf_events = []
        self.agents = {}          # id -> {label, phase, key, jstatus, jresult, meta_mtime, finished}
        self.order = []
        self.logs = {}
        self.meta = None
        self.meta_mtime = None
        self.script_src = None

    # -- lecture
    def _journal(self):
        if self.kind != 'workflow':
            return
        path = os.path.join(self.info['dir'], 'journal.jsonl')
        try:
            size = os.path.getsize(path)
        except OSError:
            return
        if size < self.joffset:
            self.joffset, self.jevents, self.wf_events = 0, [], []
        if size == self.joffset:
            return
        with open(path, 'rb') as f:
            f.seek(self.joffset)
            data = f.read(size - self.joffset)
        end = data.rfind(b'\n')
        if end < 0:
            return
        self.joffset += end + 1
        for raw in data[:end].split(b'\n'):
            try:
                e = json.loads(raw)
            except ValueError:
                continue
            self.jevents.append(e)
            aid = e.get('agentId')
            if e.get('type') == 'started' and aid:
                a = self.agents.setdefault(aid, {})
                a.update(label=e.get('label') or aid, phase=e.get('phase') or '?', key=e.get('key'))
                a.setdefault('jstatus', None)
                if aid not in self.order:
                    self.order.append(aid)
                continue
            target = None
            if aid and aid in self.agents:
                target = self.agents[aid]
            elif e.get('key'):
                target = next((a for a in self.agents.values() if a.get('key') == e.get('key')), None)
            st = journal_status(e.get('type'))
            if target is not None and st:
                target['jstatus'] = st
                if 'result' in e:
                    target['jresult'] = e.get('result')
            elif e.get('type') != 'launched':
                self.wf_events.append(e)

    def _script(self):
        sp = self.info.get('script')
        if not sp:
            return
        mt = mtime(sp)
        if mt and mt != self.meta_mtime:
            try:
                with open(sp, encoding='utf-8') as f:
                    self.script_src = f.read()
                self.meta = parse_meta(self.script_src)
            except OSError:
                self.meta = None
            self.meta_mtime = mt

    def _agent_meta(self, aid, path):
        mp = path[:-6] + '.meta.json'
        mt = mtime(mp)
        a = self.agents.get(aid)
        if a is not None and a.get('meta_mtime') == mt:
            return
        m = read_json(mp) or {}
        if a is None:
            a = self.agents[aid] = {'label': m.get('description') or aid,
                                    'phase': m.get('workflowPhase') or m.get('agentType') or 'agent',
                                    'key': None, 'jstatus': None}
            self.order.append(aid)
        a['meta_mtime'] = mt
        a['finished'] = bool(m.get('finished'))
        a['agent_type'] = m.get('agentType')
        if self.kind == 'session':
            a['label'] = m.get('description') or a.get('label') or aid
            a['phase'] = m.get('agentType') or a.get('phase') or 'agent'

    def refresh(self, only=None):
        with self.lock:
            self._journal()
            self._script()
            for path in glob.glob(os.path.join(self.info['dir'], 'agent-*.jsonl')):
                aid = os.path.basename(path)[6:-6]
                if not AG_RE.match(aid):
                    continue
                if aid not in self.agents or self.kind == 'session':
                    self._agent_meta(aid, path)
                if aid not in self.logs:
                    self.logs[aid] = AgentLog(path)
            logs = [self.logs[only]] if only and only in self.logs else list(self.logs.values())
        for log in logs:
            log.update()

    def version(self):
        return f'{self.joffset}:{sum(x.offset for x in self.logs.values())}:{len(self.logs)}'

    def _status(self, aid, h, now, mt):
        a = self.agents[aid]
        st = a.get('jstatus') or ('done' if (h['finished'] or a.get('finished')) else 'running')
        if st == 'running' and mt and now - mt > STALE_AFTER:
            st = 'stale'
        return st

    def title(self):
        if self.kind == 'workflow':
            return (self.meta or {}).get('name') or self.info['id']
        sm = self.info.get('smeta') or {}
        return sm.get('title') or (sm.get('first_prompt') or '')[:80] or 'Agents de la session'

    # -- vues
    def state(self, v=None):
        self.refresh()
        now = time.time()
        ver = self.version()
        if v and v == ver:
            return {'unchanged': True, 'now': now, 'version': ver}
        meta = self.meta or {}
        exp = EXPECTED.get(meta.get('name') or '', {}) if self.kind == 'workflow' else {}
        agents_out, feed = [], []
        tok, by_tool, domains = Counter(), Counter(), Counter()
        for aid in list(self.order):
            log = self.logs.get(aid)
            if log is None:
                continue
            a = self.agents[aid]
            with log.lock:
                h = log.header()
                acts = log.actions[-25:]
                domains.update(log.domains)
            mt = mtime(log.path)
            st = self._status(aid, h, now, mt)
            last_act = acts[-1] if acts else None
            agents_out.append({
                'id': aid, 'label': a.get('label') or aid, 'phase': a.get('phase') or '?', 'status': st,
                'first': h['first'], 'last': h['last'],
                'dur': (h['last'] - h['first']) if h['first'] and h['last'] else None,
                'tools': h['tools'], 'errors': h['errors'], 'tokens': h['tokens'], 'model': h['model'],
                'effort': h['effort'], 'events': h['events'], 'mtime': mt, 'thinking_ms': h['thinking_ms'],
                'last_action': f'{last_act[2]} · {last_act[3]}' if last_act else '',
                'last_tool': last_act[2] if last_act else None,
            })
            for k, val in h['tokens'].items():
                tok[k] += val
            by_tool.update(h['by_tool'])
            for ts, idx, name, summ in acts:
                feed.append({'t': ts, 'agent': aid, 'label': a.get('label') or aid, 'phase': a.get('phase'),
                             'tool': name, 'sum': summ, 'i': idx})
        feed.sort(key=lambda x: x['t'] or 0, reverse=True)
        if self.kind == 'session':
            agents_out.sort(key=lambda x: x['first'] or 0)

        titles = [p['title'] for p in meta.get('phases') or []]
        details = {p['title']: p.get('detail', '') for p in meta.get('phases') or []}
        for ag in agents_out:
            if ag['phase'] not in titles:
                titles.append(ag['phase'])
        phases = []
        for t in titles:
            g = [x for x in agents_out if x['phase'] == t]
            phases.append({
                'title': t, 'detail': details.get(t, ''), 'started': len(g),
                'done': sum(x['status'] == 'done' for x in g),
                'running': sum(x['status'] == 'running' for x in g),
                'error': sum(x['status'] in ('error', 'stale') for x in g),
                'expected': exp.get(t),
            })

        firsts = [x['first'] for x in agents_out if x['first']]
        lasts = [x['mtime'] or x['last'] for x in agents_out if x['mtime'] or x['last']]
        last_activity = max(lasts) if lasts else None
        running = sum(x['status'] == 'running' for x in agents_out)
        if self.kind == 'workflow':
            last_phase = next((p for p in reversed(phases) if p['expected']), phases[-1] if phases else None)
            done_flag = any(journal_status(e.get('type')) == 'done' for e in self.wf_events)
            if last_phase and last_phase['expected'] and last_phase['done'] >= last_phase['expected'][0]:
                done_flag = True
        else:
            done_flag = bool(agents_out) and not running
        if done_flag and not running:
            wstatus = 'done'
        elif last_activity and now - last_activity > STALLED_AFTER:
            wstatus = 'stalled'
        else:
            wstatus = 'running'
        exp_total = [sum(x[0] for x in exp.values()), sum(x[1] for x in exp.values())] if exp else None
        sm = self.info.get('smeta') or {}
        if self.kind == 'workflow':
            desc = meta.get('description') or ''
        else:
            desc = f"agents lancés directement par la session « {sm.get('title') or self.info['session'][:8]} »"
        return {
            'id': self.info['id'], 'kind': self.kind, 'name': self.title(), 'description': desc,
            'project': self.info['project'], 'cwd': short_home(sm.get('cwd')), 'session': self.info['session'],
            'session_title': sm.get('title'), 'script': self.info.get('script'), 'dir': self.info['dir'],
            'status': wstatus, 'started': min(firsts) if firsts else None, 'last_activity': last_activity,
            'now': now, 'version': ver, 'expected_total': exp_total,
            'totals': {
                'agents': len(agents_out), 'running': running,
                'done': sum(x['status'] == 'done' for x in agents_out),
                'error': sum(x['status'] in ('error', 'stale') for x in agents_out),
                'tools': sum(by_tool.values()), 'tokens': dict(tok),
                'searches': by_tool.get('WebSearch', 0), 'fetches': by_tool.get('WebFetch', 0),
            },
            'by_tool': by_tool.most_common(), 'domains': domains.most_common(20),
            'phases': phases, 'agents': agents_out, 'feed': feed[:FEED_SIZE],
            'wf_events': self.wf_events[-30:],
        }

    def agent(self, aid, since, want_result):
        self.refresh(only=aid)
        log = self.logs.get(aid)
        if log is None:
            return {'error': 'agent inconnu'}
        now = time.time()
        mt = mtime(log.path)
        with log.lock:
            h = log.header()
            out = {
                'id': aid, 'label': self.agents[aid].get('label'), 'phase': self.agents[aid].get('phase'),
                'status': self._status(aid, h, now, mt), 'header': h, 'total': len(log.events),
                'events': log.events[since:], 'now': now,
            }
            if since == 0:
                out.update(prompt=log.prompt, prompt_head=log.prompt_head, request=log.request)
            jres = self.agents[aid].get('jresult')
            if jres is not None:
                # le journal du workflow garde la valeur rendue par l'agent : c'est la source sûre
                h['has_result'] = True
                if want_result:
                    out.update(result=None if isinstance(jres, str) else jres,
                               result_text=jres if isinstance(jres, str) else None)
            elif want_result and h['has_result']:
                out.update(result=log.result, result_text=log.result_text if log.result is None else None)
        return out

    def full(self, aid, tu):
        log = self.logs.get(aid)
        if log is None:
            return None
        with log.lock:
            if tu in log.full:
                return log.full[tu]
            for ev in log.events:
                if ev.get('k') == 'result' and ev.get('id') == tu:
                    return ev.get('text')
        return None

    def image(self, aid, n):
        log = self.logs.get(aid)
        if log is None or not 0 <= n < len(log.images):
            return None
        mt, data = log.images[n]
        try:
            return mt, base64.b64decode(data)
        except (ValueError, TypeError):
            return None

    def system(self, aid):
        self.refresh(only=aid)
        log = self.logs.get(aid)
        if log is None:
            return {'error': 'agent inconnu'}
        with log.lock:
            return {'system': log.system, 'tools': log.tools, 'context': log.context, 'prompt_head': log.prompt_head}

    def sources(self):
        self.refresh()
        groups = {k: {} for k in ('WebFetch', 'WebSearch', 'Read', 'Bash', 'Write', 'Grep', 'MCP', 'Autres')}
        for aid in list(self.order):
            log = self.logs.get(aid)
            if log is None:
                continue
            label = self.agents[aid].get('label') or aid
            with log.lock:
                evs = [e for e in log.events if e.get('k') == 'tool']
            for ev in evs:
                name, inp = ev.get('name') or '?', ev.get('input') or {}
                if not isinstance(inp, dict):
                    inp = {}
                if name == 'WebFetch':
                    g, key, extra = 'WebFetch', inp.get('url'), inp.get('prompt')
                elif name == 'WebSearch':
                    g, key, extra = 'WebSearch', inp.get('query'), inp.get('mode')
                elif name == 'Read':
                    g, key, extra = 'Read', inp.get('file_path'), None
                elif name == 'Bash':
                    g, key, extra = 'Bash', inp.get('command'), inp.get('description')
                elif name in ('Write', 'Edit'):
                    g, key, extra = 'Write', inp.get('file_path'), name
                elif name in ('Grep', 'Glob'):
                    g, key, extra = 'Grep', f"{name}: {inp.get('pattern')}", inp.get('path')
                elif name.startswith('mcp__'):
                    g, key, extra = 'MCP', f"{name} {json.dumps(inp, ensure_ascii=False)}", None
                else:
                    g, key, extra = 'Autres', f"{name} {ev.get('sum') or ''}", None
                if not key:
                    continue
                item = groups[g].setdefault(str(key), {'key': str(key), 'extra': extra, 'count': 0, 'agents': {}})
                item['count'] += 1
                item['agents'].setdefault(aid, {'id': aid, 'label': label, 'i': ev['i']})
        return {g: sorted(({**v, 'agents': list(v['agents'].values())} for v in items.values()),
                          key=lambda x: (-x['count'], x['key']))
                for g, items in groups.items()}

    def search(self, q, limit=400):
        q = (q or '').strip().lower()
        if len(q) < 2:
            return []
        self.refresh()
        out = []
        for aid in list(self.order):
            log = self.logs.get(aid)
            if log is None:
                continue
            label = self.agents[aid].get('label') or aid
            with log.lock:
                items = list(log.search)
                kinds = {e['i']: (e.get('k'), e.get('name')) for e in log.events}
            for i, text in items:
                low = text.lower()
                pos = low.find(q)
                if pos < 0:
                    continue
                k, name = kinds.get(i, ('?', None))
                out.append({'agent': aid, 'label': label, 'i': i, 'kind': k, 'tool': name,
                            'before': text[max(0, pos - 90):pos], 'match': text[pos:pos + len(q)],
                            'after': text[pos + len(q):pos + len(q) + 160], 'count': low.count(q)})
                if len(out) >= limit:
                    return out
        return out


# ---------------------------------------------------------------- découverte des sessions

_disc = {'t': 0.0, 'sources': {}, 'sessions': {}}
_disc_lock = threading.Lock()
_srcs = {}
_srcs_lock = threading.Lock()


def discover(force=False):
    with _disc_lock:
        if not force and time.time() - _disc['t'] < 4:
            return _disc
        sources, sessions = {}, {}
        for sub in glob.glob(os.path.join(PROJECTS, '*', '*', 'subagents')):
            sdir = os.path.dirname(sub)
            sid = os.path.basename(sdir)
            if not SESSION_RE.match(sid) or not os.path.isdir(sub):
                continue
            pdir = os.path.dirname(sdir)
            project = os.path.basename(pdir)
            main = os.path.join(pdir, sid + '.jsonl')
            plain = glob.glob(os.path.join(sub, 'agent-*.jsonl'))
            wf_dirs = [d for d in glob.glob(os.path.join(sub, 'workflows', 'wf_*'))
                       if os.path.isdir(d) and WF_RE.match(os.path.basename(d))]
            if not plain and not wf_dirs:
                continue
            fallback = plain[0] if plain else next(iter(glob.glob(os.path.join(wf_dirs[0], 'agent-*.jsonl'))), None)
            smeta = session_meta(main if os.path.exists(main) else None, fallback)
            src_ids = []
            stamps = [mtime(main)]
            if plain:
                pm = max(mtime(p) for p in plain)
                stamps.append(pm)
                sid_src = 's_' + sid
                sources[sid_src] = {'id': sid_src, 'kind': 'session', 'dir': sub, 'session': sid, 'project': project,
                                    'script': None, 'mtime': pm, 'smeta': smeta, 'count': len(plain)}
                src_ids.append(sid_src)
            for d in wf_dirs:
                wid = os.path.basename(d)
                scripts = glob.glob(os.path.join(sdir, 'workflows', 'scripts', f'*-{wid}.js'))
                agent_files = glob.glob(os.path.join(d, 'agent-*.jsonl'))
                wm = max([mtime(d), mtime(os.path.join(d, 'journal.jsonl'))] + [mtime(p) for p in agent_files[-40:]])
                stamps.append(wm)
                sources[wid] = {'id': wid, 'kind': 'workflow', 'dir': d, 'session': sid, 'project': project,
                                'script': scripts[0] if scripts else None, 'mtime': wm, 'smeta': smeta,
                                'count': len(agent_files)}
                src_ids.append(wid)
            sessions[sid] = {'id': sid, 'project': project, 'main': main if os.path.exists(main) else None,
                             'smeta': smeta, 'mtime': max(stamps), 'sources': src_ids}
        _disc.update(t=time.time(), sources=sources, sessions=sessions)
        return _disc


def get_src(sid):
    if not sid or not SRC_RE.match(sid):
        return None
    d = discover()
    if sid not in d['sources']:
        d = discover(force=True)
    info = d['sources'].get(sid)
    if not info:
        return None
    with _srcs_lock:
        if sid not in _srcs:
            _srcs[sid] = Source(info)
        else:
            _srcs[sid].info.update(smeta=info.get('smeta'), mtime=info.get('mtime'))
        return _srcs[sid]


def _workflow_name(script):
    if not script:
        return None
    try:
        with open(script, encoding='utf-8') as f:
            return (parse_meta(f.read(20000)) or {}).get('name')
    except OSError:
        return None


def _source_counts(info):
    """Compte rapide (sans lire les transcripts) : agents lancés, finis."""
    if info['kind'] == 'workflow':
        started = done = 0
        try:
            with open(os.path.join(info['dir'], 'journal.jsonl'), 'rb') as f:
                for raw in f:
                    if b'"type":"started"' in raw[:40]:
                        started += 1
                    elif b'"type":"result"' in raw[:40]:
                        done += 1
        except OSError:
            pass
        return max(started, info['count']), done
    done = 0
    for p in glob.glob(os.path.join(info['dir'], 'agent-*.meta.json')):
        m = read_json(p) or {}
        done += bool(m.get('finished'))
    return info['count'], done


def list_sessions():
    d = discover()
    now = time.time()
    out = []
    for s in d['sessions'].values():
        sm = s.get('smeta') or {}
        srcs = []
        for src_id in s['sources']:
            info = d['sources'][src_id]
            agents, done = _source_counts(info)
            srcs.append({'id': src_id, 'kind': info['kind'],
                         'name': (_workflow_name(info.get('script')) or src_id) if info['kind'] == 'workflow' else 'Agents de la session',
                         'agents': agents, 'done': done, 'mtime': info['mtime'],
                         'live': now - info['mtime'] < LIVE_WINDOW})
        srcs.sort(key=lambda x: -x['mtime'])
        out.append({'id': s['id'], 'project': s['project'], 'cwd': short_home(sm.get('cwd')),
                    'title': sm.get('title'), 'first_prompt': sm.get('first_prompt'),
                    'mtime': s['mtime'], 'live': now - s['mtime'] < LIVE_WINDOW, 'sources': srcs})
    out.sort(key=lambda x: -x['mtime'])
    return out


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = 'agents-panel/2'

    def log_message(self, *args):
        pass

    def _send(self, body, ctype, code=200, immutable=False):
        enc = False
        if len(body) > 2048 and not ctype.startswith(('image/', 'font/')) and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
            body = gzip.compress(body, 5)
            enc = True
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if immutable else 'no-store')
        if enc:
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8', code)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            self._route(u.path, q)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            try:
                self._json({'error': repr(exc)}, 500)
            except OSError:
                pass

    def _static(self, path):
        """Fichier de l'interface compilée, sans jamais sortir de web/dist."""
        root = os.path.realpath(DIST)
        full = os.path.realpath(os.path.join(root, path.lstrip('/') or 'index.html'))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            return False
        with open(full, 'rb') as f:
            body = f.read()
        ext = os.path.splitext(full)[1].lower()
        self._send(body, MIME.get(ext, 'application/octet-stream'), immutable=path.startswith('/assets/'))
        return True

    def _route(self, path, q):
        if not path.startswith('/api/'):
            if path in ('/', '/index.html') and not os.path.isfile(os.path.join(DIST, 'index.html')):
                return self._send(NOT_BUILT.encode('utf-8'), 'text/html; charset=utf-8')
            if self._static('/index.html' if path == '/' else path):
                return None
            return self._json({'error': 'introuvable'}, 404)
        if path == '/api/ping':
            return self._json({'app': 'agents-panel', 'pid': os.getpid()})
        if path == '/api/sessions':
            return self._json(list_sessions())
        src = get_src(q.get('wf'))
        if path.startswith('/api/') and src is None:
            return self._json({'error': 'source introuvable (session ou workflow supprimé ?)'}, 404)
        aid = q.get('id')
        if aid is not None and not AG_RE.match(aid):
            return self._json({'error': 'agent invalide'}, 400)
        if path == '/api/state':
            return self._json(src.state(q.get('v')))
        if path == '/api/agent':
            return self._json(src.agent(aid, max(0, int(q.get('since') or 0)), q.get('res') == '1'))
        if path == '/api/full':
            tu = q.get('tu') or ''
            if not TU_RE.match(tu):
                return self._json({'error': 'outil invalide'}, 400)
            return self._json({'text': src.full(aid, tu)})
        if path == '/api/img':
            img = src.image(aid, int(q.get('n') or -1))
            if not img:
                return self._json({'error': 'image introuvable'}, 404)
            return self._send(img[1], img[0])
        if path == '/api/system':
            return self._json(src.system(aid))
        if path == '/api/sources':
            return self._json(src.sources())
        if path == '/api/search':
            return self._json(src.search(q.get('q')))
        if path == '/api/script':
            src.refresh()
            return self._json({'path': src.info.get('script'), 'source': src.script_src})
        if path == '/api/journal':
            src.refresh()
            return self._json([{k: (json.dumps(v, ensure_ascii=False)[:2000] if isinstance(v, (dict, list)) else v)
                                for k, v in e.items()} for e in src.jevents])
        return self._json({'error': 'introuvable'}, 404)


# ---------------------------------------------------------------- lancement

def running_instance(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/ping', timeout=0.6) as r:
            if json.load(r).get('app') == 'agents-panel':
                return True
    except (OSError, ValueError):
        pass
    return False


def read_pid():
    try:
        with open(PIDFILE, encoding='utf-8') as f:
            pid, port = f.read().split()
        pid, port = int(pid), int(port)
        os.kill(pid, 0)
        return pid, port
    except (OSError, ValueError):
        return None, None


def stop():
    pid, port = read_pid()
    if not pid:
        print('Le panneau des agents ne tourne pas.')
        return False
    os.kill(pid, signal.SIGTERM)
    for _ in range(30):
        try:
            os.kill(pid, 0)
        except OSError:
            break
        time.sleep(0.1)
    try:
        os.remove(PIDFILE)
    except OSError:
        pass
    print(f'Panneau des agents arrêté (port {port}).')
    return True


def main():
    ap = argparse.ArgumentParser(prog='agents', description='Panneau web des agents et workflows Claude Code (lecture seule).')
    ap.add_argument('action', nargs='?', default='start', choices=['start', 'stop', 'restart'],
                    help='start (défaut), stop ou restart')
    ap.add_argument('--port', type=int, default=DEFAULT_PORT)
    ap.add_argument('--no-open', action='store_true', help="ne pas ouvrir le navigateur")
    ap.add_argument('--foreground', action='store_true', help='rester au premier plan (Ctrl+C pour arrêter)')
    args = ap.parse_args()

    if args.action == 'stop':
        stop()
        return
    if args.action == 'restart':
        stop()

    pid, port = read_pid()
    for p in [port, args.port]:
        if p and running_instance(p):
            url = f'http://127.0.0.1:{p}/'
            print(f'Panneau des agents déjà lancé : {url}   (agents stop pour l\'arrêter)')
            if not args.no_open:
                webbrowser.open(url)
            return

    srv = None
    for p in range(args.port, args.port + 20):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', p), Handler)
            break
        except OSError:
            continue
    if srv is None:
        raise SystemExit('Aucun port libre.')
    srv.daemon_threads = True
    port = srv.server_address[1]
    url = f'http://127.0.0.1:{port}/'

    if not args.foreground:
        sys.stdout.flush()  # sinon le texte en attente serait écrit deux fois (parent et enfant)
        if os.fork() > 0:  # le parent rend la main au terminal
            print(f'Panneau des agents : {url}   (agents stop pour l\'arrêter)', flush=True)
            if not args.no_open:
                webbrowser.open(url)
            os._exit(0)
        os.setsid()
        sys.stdout.flush()
        log = open(LOGFILE, 'a', encoding='utf-8')
        os.dup2(log.fileno(), 1)
        os.dup2(log.fileno(), 2)
        devnull = os.open(os.devnull, os.O_RDONLY)
        os.dup2(devnull, 0)
    else:
        print(f'Panneau des agents : {url}   (Ctrl+C pour arrêter)', flush=True)
        if not args.no_open:
            threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    with open(PIDFILE, 'w', encoding='utf-8') as f:
        f.write(f'{os.getpid()} {port}')

    def bye(*_):
        try:
            if read_pid()[0] == os.getpid():
                os.remove(PIDFILE)
        except OSError:
            pass
        os._exit(0)

    signal.signal(signal.SIGTERM, bye)
    print(f'{datetime.now():%Y-%m-%d %H:%M:%S} démarré sur {url} (pid {os.getpid()})', flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nArrêté.')
    finally:
        bye()


if __name__ == '__main__':
    main()
