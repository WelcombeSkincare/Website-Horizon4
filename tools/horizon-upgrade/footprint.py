import os,sys,json,re
ours,s414,s430=sys.argv[1:4]
CODE=('layout','sections','blocks','snippets','assets','locales','config')
def files(r):
    out=set()
    for d in CODE:
        p=os.path.join(r,d)
        if os.path.isdir(p): out|={f'{d}/{f}' for f in os.listdir(p)}
    return out
def rd(p):
    s=open(p,'rb').read().replace(b'\r',b'')
    if p.endswith('.json'):
        s=re.sub(rb'^\s*/\*.*?\*/\s*',b'',s,flags=re.S)
        try: return json.dumps(json.loads(s),sort_keys=True).encode()
        except Exception: pass
    return s.strip()
skip=lambda f: f.startswith('config/settings_data') or f.endswith('-group.json') or (f.startswith('locales/') and f not in ('locales/en.default.json',))
O,A,B=files(ours),files(s414),files(s430)
mod=sorted(f for f in O&A if not skip(f) and rd(f'{ours}/{f}')!=rd(f'{s414}/{f}'))
up=set(f for f in A&B if not skip(f) and rd(f'{s414}/{f}')!=rd(f'{s430}/{f}'))
print(f"STOCK CODE FILES WE MODIFIED (real changes): {len(mod)}")
for f in mod: print('   ~',f,'   <-- ALSO CHANGED UPSTREAM' if f in up else '')
print(f"\nUPSTREAM 4.1.4 -> 4.3.0 code files changed: {len(up)}")
