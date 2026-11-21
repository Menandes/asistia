# Asistia

Prototipo funcional (MVP) de Asistia, una plataforma web que reduce la inasistencia no avisada a citas médicas en consultorios independientes e IPS ambulatorias pequeñas.

Proyecto del módulo Emprendimiento de Base Tecnológica, Politécnico Grancolombiano.

- Prototipo: https://menandes.github.io/asistia/
- Pitch deck: https://menandes.github.io/asistia/pitch/

## Qué hace

- Agenda semanal por profesional, con creación de citas y registro de la autorización del paciente para recibir recordatorios.
- Recordatorios automáticos a los tres días y a las 24 horas de la cita.
- Respuesta del paciente con un toque: confirmar, cancelar o reprogramar.
- Marcación de citas en riesgo cuando el paciente no responde.
- Lista de espera: cuando alguien cancela, el cupo se ofrece al siguiente paciente, que tiene dos horas para aceptarlo.
- Indicadores: inasistencia, confirmaciones, cancelaciones con aviso y cupos recuperados.

## Cómo probarlo

1. Abre el prototipo. Arriba está el reloj de la simulación.
2. Pulsa **Siguiente evento** para adelantar el tiempo hasta el próximo recordatorio.
3. En el teléfono de la derecha, responde como paciente.
4. Cancela una cita y revisa cómo el cupo se ofrece a la lista de espera.
5. Revisa la sección **Indicadores**.

En **Consultorio** puedes restablecer los datos de demostración.

## Alcance del prototipo

- Los mensajes de WhatsApp se simulan dentro de la página; no se envía ningún mensaje real.
- Los datos se guardan solo en el navegador de quien lo usa (almacenamiento local).
- Los pacientes, profesionales y el consultorio son datos de demostración ficticios.

## Estructura

```
index.html        Aplicación
styles.css        Estilos
app.js            Lógica: agenda, motor de eventos, lista de espera e indicadores
favicon.svg       Logo
fonts/            Tipografía Atkinson Hyperlegible (SIL Open Font License)
img/              Capturas usadas en el pitch deck y código QR
pitch/index.html  Pitch deck de 10 diapositivas
```

No requiere compilación ni dependencias. Para verlo en local basta con servir la carpeta, por ejemplo con `python -m http.server`.
