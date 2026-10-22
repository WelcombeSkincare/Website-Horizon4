import os,sys,json,re,glob
repo,s414,s430=sys.argv[1:4]
def schema(path):
    try: t=open(path,encoding='utf-8-sig').read()
    except FileNotFoundError: return None
    m=re.search(r'\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}',t,re.S)
    try: return json.loads(m.group(1)) if m else None
    except Exception: return None
def opts(sch):
    return {s['id']:{o['value'] for o in s.get('options',[])} for s in (sch or {}).get('settings',[]) if s.get('type') in ('select','radio') and 'id' in s}
def load_json(p): return json.loads(re.sub(r'^\s*/\*.*?\*/\s*','',open(p,encoding='utf-8-sig').read(),flags=re.S))
bad=[]; n=0
def check(kind,typ,settings,where):
    global n
    o4,o3=opts(schema(f'{s414}/{kind}/{typ}.liquid')),opts(schema(f'{s430}/{kind}/{typ}.liquid'))
    for k,v in settings.items():
        if k in o3 and isinstance(v,str) and not v.startswith('{{'):
            n+=1
            if v in o4.get(k,{v}) and v not in o3[k]:
                bad.append(f'{where} {typ}.{k} = "{v}"  (4.3.0 allows {sorted(o3[k])})')
def walk(blocks,where):
    for bid,b in (blocks or {}).items():
        t=b.get('type','')
        if not t.startswith('shopify://'): check('blocks',t,b.get('settings',{}),where)
        walk(b.get('blocks'),where)
for p in sorted(glob.glob(f'{repo}/templates/*.json'))+sorted(glob.glob(f'{repo}/sections/*.json')):
    rel=os.path.relpath(p,repo).replace(os.sep,'/')
    for sid,sec in (load_json(p).get('sections') or {}).items():
        check('sections',sec.get('type',''),sec.get('settings',{}),f'{rel}/{sid}')
        walk(sec.get('blocks'),f'{rel}/{sid}')
print(f"select/radio values checked: {n}\nvalues valid in 4.1.4 but not in 4.3.0: {len(bad)}")
print('\n'.join('  '+b for b in bad) or '  none')
