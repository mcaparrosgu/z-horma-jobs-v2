---
description: Lista las candidaturas de una usuaria por estado
argument-hint: <usuaria>
---

Usuaria: $0
**Antes de nada:** comprueba que cada identificador recibido (usuaria, oferta, fuente) cumple `^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$`; el de la **usuaria** además va **en minúsculas** (`^[a-z0-9_-][a-z0-9_.-]{0,79}$`, como en la base de datos y en su carpeta de Windows); si no, para y dilo. Pon siempre las rutas entre comillas.


Lee los `estado.json` de `datos/candidaturas/$0/*/` y muestra una tabla: oferta, empresa, estado y fecha del último cambio, agrupada por estado (borrador, aprobada, enviada, entrevista, rechazada, sin respuesta, pendiente de ti, descartada). Solo lectura.

**El estado al día está en la web, en «Seguimiento» (`/seguimiento`):** la usuaria cambia allí su candidatura (enviada → entrevista/rechazada/sin respuesta, etc.), no aquí. Este comando lee los archivos en disco (útiles para depurar el pipeline de agentes); pueden ir por detrás de lo que ve la usuaria en la web.
