import os,sys,json,re,glob
repo,s414,s430=sys.argv[1:4]
def schema(path):
    try: t=open(path,encoding='utf-8-sig').read()
    except FileNotFoundError: return None
    m=re.search(r'\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}',t,re.S)
    if not m: return {}
    try: return json.loads(m.group(1))
    except Exception: return {}
def ids(sch): return {s['id'] for s in (sch or {}).get('settings',[]) if 'id' in s}
def lookup(root,kind,typ):
    # our own files are identical on both sides of the upgrade; only stock files change
    return schema(os.path.join(root,kind,typ+'.liquid'))
def load_json(p):
    t=open(p,encoding='utf-8-sig').read()
    return json.loads(re.sub(r'^\s*/\*.*?\*/\s*','',t,flags=re.S))
problems=[]; checked=0
def walk_blocks(blocks,where):
    global checked
    for bid,b in (blocks or {}).items():
        typ=b.get('type','')
        if typ.startswith('shopify://') or typ=='@app': continue
        old,new=lookup(s414,'blocks',typ),lookup(s430,'blocks',typ)
        if old is None and new is None:   # block declared inside a section schema, or our own block
            pass
        elif old is not None and new is None:
            problems.append(f'BLOCK TYPE REMOVED  {where} block "{bid}" type "{typ}"')
        else:
            for k in b.get('settings',{}):
                checked+=1
                if k in ids(old) and k not in ids(new):
                    problems.append(f'SETTING DROPPED  {where} block "{bid}" ({typ}).{k}')
        walk_blocks(b.get('blocks'),where)
files=sorted(glob.glob(os.path.join(repo,'templates','*.json')))+sorted(glob.glob(os.path.join(repo,'sections','*.json')))
for p in files:
    rel=os.path.relpath(p,repo).replace(os.sep,'/')
    d=load_json(p)
    for sid,sec in (d.get('sections') or {}).items():
        typ=sec.get('type','')
        old,new=lookup(s414,'sections',typ),lookup(s430,'sections',typ)
        if old is not None and new is None:
            problems.append(f'SECTION TYPE REMOVED  {rel} section "{sid}" type "{typ}"'); continue
        if old is not None:
            for k in sec.get('settings',{}):
                checked+=1
                if k in ids(old) and k not in ids(new):
                    problems.append(f'SETTING DROPPED  {rel} section "{sid}" ({typ}).{k}')
        walk_blocks(sec.get('blocks'),f'{rel} section "{sid}"')
# global theme settings
gs_old={s['id'] for g in json.load(open(os.path.join(s414,'config','settings_schema.json'),encoding='utf-8-sig')) for s in g.get('settings',[]) if 'id' in s}
gs_new={s['id'] for g in json.load(open(os.path.join(s430,'config','settings_schema.json'),encoding='utf-8-sig')) for s in g.get('settings',[]) if 'id' in s}
cur=load_json(os.path.join(repo,'config','settings_data.json'))['current']
for k in cur:
    if k in ('blocks','sections','content_for_index'): continue
    checked+=1
    if k in gs_old and k not in gs_new: problems.append(f'GLOBAL SETTING DROPPED  config/settings_data.json .{k}')
print(f"content files scanned: {len(files)+1}   setting values checked: {checked}")
print(f"global settings: 4.1.4 declares {len(gs_old)}, 4.3.0 declares {len(gs_new)}; removed in 4.3.0: {sorted(gs_old-gs_new) or 'none'}; added: {sorted(gs_new-gs_old) or 'none'}")
print(f"\nPROBLEMS: {len(problems)}"); print("\n".join('  '+p for p in problems) or '  none')
