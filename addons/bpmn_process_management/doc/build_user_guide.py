"""Build the self-contained user guide (images embedded as data URIs).

    python3 doc/build_user_guide.py

Writes doc/user_guide.html and static/doc/user_guide.html (the copy served by
the module: menu Processes > User Guide and the "?" button of the editor)."""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def data_uri(name):
    with open(os.path.join(HERE, "images", name), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def main():
    with open(os.path.join(HERE, "user_guide_src.html"), encoding="utf-8") as f:
        html = f.read()
    html = re.sub(r"\{\{img:([\w.-]+)\}\}",
                  lambda m: '<img src="%s" alt="" loading="lazy">' % data_uri(m.group(1)), html)
    html = re.sub(r"\{\{imgraw:([\w.-]+)\}\}",
                  lambda m: '<img src="%s" alt="">' % data_uri(m.group(1)), html)
    missing = re.findall(r"\{\{[^}]+\}\}", html)
    if missing:
        raise SystemExit("unresolved placeholders: %s" % missing)
    for path in (os.path.join(HERE, "user_guide.html"),
                 os.path.join(ROOT, "static", "doc", "user_guide.html")):
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        print(path, len(html) // 1024, "KB")


if __name__ == "__main__":
    main()
