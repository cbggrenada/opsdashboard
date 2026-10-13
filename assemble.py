s=open('src/head.html').read()+open('src/body.html').read()+'<script>'+open('src/render.js').read()+open('src/pages-brew-sc.js').read()+open('src/pages-sc2.js').read()+open('src/pages-kpi.js').read()+open('src/report.js').read().replace('</script>\n</body>','\n'+open('src/compare.js').read()+'\n'+open('src/look.js').read()+'\n</script>\n</body>',1)
s=s.replace('%%LOGO%%',open('logo.txt').read())
# Chart.js built in, so the charts never depend on a CDN
tag='<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>'
if tag in s: s=s.replace(tag,'<script>/* Chart.js 4.4.1 (MIT) */\n'+open('vendor/chart.umd.min.js').read()+'\n</script>')
open('index.html','w').write(s)
print(len(s))
