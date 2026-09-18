{% set lines = entry.main_column.splitlines() %}
[
  #text(size: 1.1em, weight: "semibold")[{{ entry.label }}]
  #text(size: 1em)[{{ entry.details }}]
],
