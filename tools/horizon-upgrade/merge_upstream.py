"""Three-way merge of a new stock Horizon release into this theme.

    python tools/horizon-upgrade/merge_upstream.py <theme repo> <stock OLD> <stock NEW>

<stock OLD> is the Horizon release the theme is currently on, <stock NEW> the
target, both as plain trees (git archive from github.com/Shopify/horizon).
Edit CUSTOM and TAKE_UPSTREAM below before running: the script STOPS if any stock
file differs from <stock OLD> without being listed in one of them. Writes
merge-log.json in the current directory. First used for 4.1.4 -> 4.3.0.
"""
import os, sys, json, re, subprocess, tempfile, shutil
ours, s414, s430 = sys.argv[1:4]
CODE_DIRS = ('assets','blocks','layout','locales','sections','snippets','config','templates')
CUSTOM = {'sections/section.liquid','snippets/cart-drawer.liquid','snippets/cart-summary.liquid',
          'snippets/cart-products.liquid','locales/en.default.json'}
TAKE_UPSTREAM = {'blocks/_header-logo.liquid','snippets/grid-density-controls.liquid',
                 'snippets/variant-picker-styles.liquid','assets/base.css','blocks/_featured-blog-posts-title.liquid'}
def is_content(f):  # merchant content, never touched by the code merge
    # JSON templates are merchant content; Liquid templates (gift_card.liquid) are code.
    return (f.startswith('templates/') and f.endswith('.json')) or f == 'config/settings_data.json' or (f.startswith('sections/') and f.endswith('.json'))
def files(root):
    out=set()
    for d in CODE_DIRS:
        p=os.path.join(root,d)
        if os.path.isdir(p): out |= {f'{d}/{x}' for x in os.listdir(p)}
    return {f for f in out if not is_content(f)}
def raw(p): return open(p,'rb').read()
def lf(b):  # Shopify serves files with CRLF and two leading blank lines; GitHub source has neither
    b=b.replace(b'\r\n',b'\n')
    return b.lstrip(b'\n')
def norm(p):
    b=lf(raw(p))
    if p.endswith('.json'):
        b2=re.sub(rb'^\s*/\*.*?\*/\s*',b'',b,flags=re.S)
        try: return json.dumps(json.loads(b2),sort_keys=True).encode()
        except Exception: pass
    return b.strip()
O,A,B=files(ours),files(s414),files(s430)
log={'taken':[], 'merged_clean':[], 'merged_conflict':[], 'added':[], 'deleted':[], 'unexpected':[]}
# safety pass first: anything modified that we have not classified stops the merge
for f in sorted(O & A):
    if norm(f'{ours}/{f}') != norm(f'{s414}/{f}') and f not in CUSTOM and f not in TAKE_UPSTREAM:
        log['unexpected'].append(f)
if log['unexpected']:
    print(json.dumps(log, indent=1)); sys.exit(2)
for f in sorted(B):
    dst=f'{ours}/{f}'
    if f not in O:
        os.makedirs(os.path.dirname(dst),exist_ok=True); shutil.copyfile(f'{s430}/{f}',dst); log['added'].append(f); continue
    if f in CUSTOM:
        with tempfile.TemporaryDirectory() as t:
            paths=[]
            for name,src in (('ours',dst),('base',f'{s414}/{f}'),('theirs',f'{s430}/{f}')):
                q=os.path.join(t,name); open(q,'wb').write(lf(raw(src))); paths.append(q)
            r=subprocess.run(['git','merge-file','-p','-L','OURS (Biotaderm 4.1.4)','-L','BASE (stock 4.1.4)','-L','THEIRS (stock 4.3.0)',*paths],capture_output=True)
            open(dst,'wb').write(r.stdout)
            (log['merged_conflict'] if r.returncode>0 else log['merged_clean']).append(f + (f'  ({r.returncode} conflict(s))' if r.returncode>0 else ''))
        continue
    if norm(dst)!=norm(f'{s430}/{f}'):
        shutil.copyfile(f'{s430}/{f}',dst); log['taken'].append(f)
for f in sorted((A - B) & O):
    if f in CUSTOM: log['unexpected'].append('removed upstream but customised: '+f); continue
    os.remove(f'{ours}/{f}'); log['deleted'].append(f)
print(json.dumps({k:(v if k!='taken' else f'{len(v)} files') for k,v in log.items()}, indent=1))
json.dump(log, open('merge-log.json','w'), indent=1)
