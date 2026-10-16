import re
import os
d = os.path.dirname(os.path.abspath(__file__)) + '/'
t = open(d + 'template.html', encoding='utf-8').read()
data = open(d + 'data.json', encoding='utf-8').read().replace('</', '<\\/')
for key, path in (('/*CSS*/', 'style.css'), ('/*LOGIC*/', 'logic.js'), ('/*APP*/', 'app.js')):
    t = t.replace(key, open(d + path, encoding='utf-8').read())
t = t.replace('/*DATA*/', data)
open(d + '../index.html', 'w', encoding='utf-8').write(t)
print(len(t.encode('utf-8')) // 1024, 'KB')
