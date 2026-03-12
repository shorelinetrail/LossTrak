-- Delete any loss entries for Grade Slate category where amount > 300
DELETE FROM loss_entries
WHERE category_id IN (
  SELECT id FROM loss_categories WHERE name = 'Grade Slate'
)
AND amount > 300;
