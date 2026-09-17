{% if snake_case_section_title in ["languages"] %}
== {{ section_title }}

#grid(
  columns: (1fr, 1fr, 1fr),
  column-gutter: 1.3em,
  row-gutter: 1em,

{% elif entry_type in ["OneLineEntry"] %}
== {{ section_title }}

#grid(
  columns: (1fr),
  row-gutter: 0.6em,

{% elif entry_type in ["ReversedNumberedEntry"] %}
== {{ section_title }}

#reversed-numbered-entries(
[

{% else %}
== {{ section_title }}

{% endif %}