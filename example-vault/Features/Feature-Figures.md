---
title: "Feature: Figures"
author: MrIwan
---

# Figures

Image embeds register as numbered figures; wikilinks to embedded images resolve to figure references.

![[image-test]]

# Image Width Tests

One embed per `|w=` value type — each should render at the labelled size with no parse error.

![[neuron.excalidraw.png|Percent (w=50%)|w=50%]]

![[neuron.excalidraw.png|Pixels (w=300px)|w=300px]]

![[neuron.excalidraw.png|Centimeters (w=5cm)|w=5cm]]

![[neuron.excalidraw.png|Millimeters (w=80mm)|w=80mm]]

![[neuron.excalidraw.png|No width hint (natural size)]]
