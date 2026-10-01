s=open('src/head.html').read()+open('src/body.html').read()+'<script>'+open('src/render.js').read()+open('src/pages-brew-sc.js').read()+open('src/pages-sc2.js').read()+open('src/pages-kpi.js').read()+open('src/report.js').read()
s=s.replace('%%LOGO%%',open('logo.txt').read())
open('index.html','w').write(s)
print(len(s))
