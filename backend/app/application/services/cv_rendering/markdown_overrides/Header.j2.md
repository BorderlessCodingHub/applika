{% if cv.name %}
# {{ cv.name }}'s CV
{% endif %}

{% if cv.headline %}
{{ cv.headline }}

{% endif %}
{% for connection in cv._connections %}
- {{ connection }}
{% endfor %}
