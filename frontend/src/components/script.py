import re

with open('AlertSettings.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace variables
content = content.replace('var(--text)', 'var(--text-primary)')
content = content.replace('var(--muted)', 'var(--text-secondary)')
content = content.replace('var(--hint)', 'var(--text-secondary)')
content = content.replace('var(--primary)', 'var(--accent)')
content = content.replace('var(--border)', 'var(--border-color)')
content = content.replace('#d0d0d0', 'rgba(255, 255, 255, 0.1)')
content = content.replace('#ffffff', 'var(--bg-main)')
content = content.replace('#f8f9fa', 'transparent')
content = content.replace("border: '1px dashed var(--hint)'", "border: '1px dashed var(--border-color)'")
content = content.replace('className="secondary-button"', 'className="btn-sand" style={{background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-primary)"}}')
content = content.replace('className="primary-button"', 'className="btn-sand"')

# Update inputs
content = content.replace("border: '1px solid var(--border-color)'", "border: 'none', borderBottom: '1px solid var(--border-color)', background: 'transparent'")
content = content.replace("borderRadius: '8px'", "borderRadius: '0px'")

# Replace text-primary-primary mistakes if any
content = content.replace('var(--text-primary-primary)', 'var(--text-primary)')
content = content.replace('var(--text-secondary-secondary)', 'var(--text-secondary)')
content = content.replace('var(--border-color-color)', 'var(--border-color)')

with open('AlertSettings.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
