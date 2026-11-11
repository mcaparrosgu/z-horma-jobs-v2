#!/usr/bin/env python3
"""Convierte un CV (PDF, DOCX, HTML, Markdown o texto) a texto plano para /perfilar.

Uso:
    python -I convertir_cv.py <archivo> <carpeta-salida>

- .md y .txt: se copian.
- .docx: se lee con zipfile (biblioteca estándar), párrafo a párrafo.
- .html: se lee con html.parser (biblioteca estándar); se descartan <script>, <style> y comentarios.
- .pdf: necesita la librería `pypdf`. Si no está instalada, el script se detiene y lo dice:
  instalar una dependencia nueva es decisión de Mar (coste cero, mantenimiento bajo).
El archivo resultante se llama igual que el original con extensión .txt.
"""
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def docx_a_texto(ruta: Path) -> str:
    with zipfile.ZipFile(ruta) as z:
        if z.getinfo("word/document.xml").file_size > 20_000_000:
            raise ValueError("document.xml supera 20 MB: se rechaza el archivo")
        raiz = ElementTree.fromstring(z.read("word/document.xml"))
    parrafos = []
    for p in raiz.iter(W + "p"):
        parrafos.append("".join(t.text or "" for t in p.iter(W + "t")))
    return "\n".join(parrafos)

class _ExtractorHtml(HTMLParser):
    """Texto visible de un HTML: sin script, style ni comentarios; un salto de línea por bloque."""
    BLOQUES = {"p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "dt", "dd", "pre", "blockquote",
               "main", "nav", "aside", "form", "section", "article", "header", "footer",
               "h1", "h2", "h3", "h4", "h5", "h6", "table", "hr"}
    OCULTOS = {"script", "style", "head", "template", "noscript"}
    VACIOS = {"br", "hr", "img", "meta", "link", "input", "area", "base", "col", "embed", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes, self.oculto = [], 0
        self.tag_oculta, self.prof = None, 0  # elemento oculto por atributo: su texto es invisible para quien lee el CV

    @staticmethod
    def _oculto_por_atributo(attrs) -> bool:
        a = {k: (v or "").lower().replace(" ", "") for k, v in attrs}
        return ("hidden" in a or a.get("aria-hidden") == "true"
                or "display:none" in a.get("style", "") or "visibility:hidden" in a.get("style", ""))

    def handle_starttag(self, tag, attrs):
        if self.tag_oculta:
            if tag == self.tag_oculta:
                self.prof += 1
            return
        if tag in self.VACIOS:
            if tag in self.BLOQUES:
                self.partes.append("\n")
            return
        if self._oculto_por_atributo(attrs):
            self.tag_oculta, self.prof = tag, 1
            return
        if tag in self.OCULTOS:
            self.oculto += 1
        elif tag in self.BLOQUES:
            self.partes.append("\n")

    def handle_endtag(self, tag):
        if self.tag_oculta:
            if tag == self.tag_oculta:
                self.prof -= 1
                if self.prof == 0:
                    self.tag_oculta = None
            return
        if tag in self.OCULTOS:
            self.oculto = max(0, self.oculto - 1)
        elif tag in self.BLOQUES:
            self.partes.append("\n")

    def handle_data(self, data):
        if not self.oculto and not self.tag_oculta:
            self.partes.append(data)


def html_a_texto(ruta: Path) -> str:
    # Entrada no fiable: tope de tamaño (un CV en HTML cabe de sobra en 5 MB).
    if ruta.stat().st_size > 5_000_000:
        print("El HTML pesa más de 5 MB: no parece un CV. No se lee.", file=sys.stderr)
        sys.exit(3)
    p = _ExtractorHtml()
    p.feed(ruta.read_text(encoding="utf-8", errors="replace"))
    p.close()
    lineas = (re.sub(r"[ \t\u00a0]+", " ", l).strip() for l in "".join(p.partes).split("\n"))
    return "\n".join(l for l in lineas if l)  # un bloque por línea, sin vacías


def pdf_a_texto(ruta: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        # `python -I` ignora la carpeta de paquetes de usuario donde `pip install pypdf` la deja:
        # se añade solo durante este import (y solo si existe) y se quita justo después, para
        # que ningún otro import del script pueda cargar código desde esa carpeta.
        import site
        usuario = site.getusersitepackages()
        if Path(usuario).is_dir():
            sys.path.append(usuario)
        try:
            from pypdf import PdfReader
        except ImportError:
            print("Falta `pypdf` para leer PDF (instalar: pip install pypdf).", file=sys.stderr)
            sys.exit(3)
        finally:
            if usuario in sys.path:
                sys.path.remove(usuario)
    # Un PDF es entrada no fiable: tope de tamaño y de páginas (un CV real cabe de sobra).
    if ruta.stat().st_size > 10_000_000:
        print("El PDF pesa más de 10 MB: no parece un CV. No se lee.", file=sys.stderr)
        sys.exit(3)
    try:
        paginas = PdfReader(str(ruta)).pages
        if len(paginas) > 30:
            print("El PDF tiene más de 30 páginas: se leen solo las 30 primeras.", file=sys.stderr)
        return "\n".join((paginas[i].extract_text() or "") for i in range(min(len(paginas), 30)))
    except Exception:  # cifrado, dañado o que pide una librería que aquí no se carga: mensaje fijo, sin traceback
        print("No se pudo leer el PDF (¿está cifrado o dañado?). Pega el texto del CV a mano.", file=sys.stderr)
        sys.exit(3)


def main() -> int:
    # En Windows la consola usa cp1252: se fuerza UTF-8 para tildes y eñes.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    origen, destino = Path(sys.argv[1]), Path(sys.argv[2])
    ext = origen.suffix.lower()
    if ext in (".md", ".txt"):
        texto = origen.read_text(encoding="utf-8")
    elif ext == ".docx":
        texto = docx_a_texto(origen)
    elif ext in (".html", ".htm"):
        texto = html_a_texto(origen)
    elif ext == ".pdf":
        texto = pdf_a_texto(origen)
    else:
        print(f"Formato no admitido: {ext}", file=sys.stderr)
        return 2
    texto = re.sub(r"\n{3,}", "\n\n", texto).strip() + "\n"
    destino.mkdir(parents=True, exist_ok=True)
    salida = destino / (origen.stem + ".txt")
    salida.write_text(texto, encoding="utf-8")
    print(str(salida))
    return 0


if __name__ == "__main__":
    sys.exit(main())
