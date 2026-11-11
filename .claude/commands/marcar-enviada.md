---
description: Anota que la usuaria ha enviado una candidatura aprobada
argument-hint: <usuaria> <oferta-id> <canal>
---

Usuaria: $0 · Oferta: $1 · Canal: $2
**Antes de nada:** comprueba que cada identificador recibido (usuaria, oferta, fuente) cumple `^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,79}$`; el de la **usuaria** además va **en minúsculas** (`^[a-z0-9_-][a-z0-9_.-]{0,79}$`, como en la base de datos y en su carpeta de Windows); si no, para y dilo. Pon siempre las rutas entre comillas.


Si `estado.json` no está en `aprobada`, o la entrada `aprobada` del `historial` no tiene `por: usuaria`, para y explica por qué. Si lo está, pasa a `enviada` con fecha y canal en `historial`.

**Desde el bloque 4 este comando ya no escribe nada:** anotar el envío se hace en la web (`/candidaturas/<tu id público>`, botón «Marcar como enviada»), con la sesión de la usuaria. El importador rechaza archivos con estados `aprobada` o `enviada`. Indícale la página.
