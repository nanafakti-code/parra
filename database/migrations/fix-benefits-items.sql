-- Actualiza la sección de Beneficios (home/benefits) para que muestre
-- los 3 items correctos (Agarre Extremo, Durabilidad Superior, Comodidad Total)
-- en lugar de los 4 items genéricos del seed inicial.

UPDATE public.page_sections
SET content = jsonb_set(
  content,
  '{items}',
  '[
    {"icon": "hand",   "title": "Agarre Extremo",      "description": "Látex de contacto alemán de última generación para un control total en cualquier condición climática."},
    {"icon": "shield", "title": "Durabilidad Superior", "description": "Materiales reforzados con tecnología anti-abrasión que resisten las sesiones más intensas."},
    {"icon": "heart",  "title": "Comodidad Total",      "description": "Diseño anatómico que se adapta como una segunda piel. Máxima ventilación y mínimo peso."}
  ]'::jsonb,
  true
)
WHERE page_name = 'home'
  AND section_key = 'benefits';
