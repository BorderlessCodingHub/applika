{% if cv.name %}
= #text(tracking: 1.5pt)[#upper[{{ cv.name }}]]
{% endif %}

{% if cv.headline %}
  #headline([{{ cv.headline }}])

{% endif %}
#connections(
{% for connection in cv._connections %}
  [{{ connection }}],
{% endfor %}
)
