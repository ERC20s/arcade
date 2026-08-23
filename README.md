# arcade
A collection of small browser games, one folder each, zero dependencies, keyboard and touch, shared launcher.

Layout after this change:

- index.html (root launcher) — lists games and links to games/<name>/index.html
- games/hello/index.html — starter single-file game (HTML+CSS+JS, <=400 lines)

Open index.html in a browser to launch the games. Contributors should add a folder games/<name>/ with a single index.html file implementing keyboard and touch controls and keeping the file under 400 lines.