-- Nullify media_files references to messages in fake conversations
UPDATE media_files SET message_id = NULL WHERE message_id IN (
  SELECT m.id FROM messages m 
  JOIN conversations c ON m.conversation_id = c.id
  JOIN wa_numbers wn ON c.wa_number_id = wn.id 
  WHERE wn.phone_number_id LIKE 'pn_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);

UPDATE media_files SET message_id = NULL WHERE message_id IN (
  SELECT m.id FROM messages m 
  JOIN conversations c ON m.conversation_id = c.id
  JOIN contacts ct ON c.contact_id = ct.id 
  WHERE ct.display_name LIKE 'contact_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);

-- Step 1: Delete messages from fake conversations (via fake wa_numbers)
DELETE FROM messages WHERE conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN wa_numbers wn ON c.wa_number_id = wn.id 
  WHERE wn.phone_number_id LIKE 'pn_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);

DELETE FROM conversation_notes WHERE conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN wa_numbers wn ON c.wa_number_id = wn.id 
  WHERE wn.phone_number_id LIKE 'pn_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);

DELETE FROM conversations WHERE wa_number_id IN (
  SELECT id FROM wa_numbers WHERE phone_number_id LIKE 'pn_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);

-- Step 2: Delete fake wa_numbers
DELETE FROM wa_numbers WHERE phone_number_id LIKE 'pn_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973';
DELETE FROM wa_numbers WHERE phone_number_id = '459851797218855' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973';

-- Step 3: Delete templates and numbers from fake wa_accounts
DELETE FROM templates WHERE wa_account_id IN (
  SELECT id FROM wa_accounts WHERE waba_id LIKE 'waba_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM wa_numbers WHERE wa_account_id IN (
  SELECT id FROM wa_accounts WHERE waba_id LIKE 'waba_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM wa_accounts WHERE waba_id LIKE 'waba_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973';

-- Step 4: Delete fake contacts and their conversations
DELETE FROM messages WHERE conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN contacts ct ON c.contact_id = ct.id 
  WHERE ct.display_name LIKE 'contact_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM conversation_notes WHERE conversation_id IN (
  SELECT c.id FROM conversations c 
  JOIN contacts ct ON c.contact_id = ct.id 
  WHERE ct.display_name LIKE 'contact_%' AND c.tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM conversations WHERE contact_id IN (
  SELECT id FROM contacts WHERE display_name LIKE 'contact_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM contacts WHERE display_name LIKE 'contact_%' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973';

-- Step 5: Delete the wrong 'hand Mohamed Azab' account
DELETE FROM templates WHERE wa_account_id IN (
  SELECT id FROM wa_accounts WHERE waba_id = '1381823417288383' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM wa_numbers WHERE wa_account_id IN (
  SELECT id FROM wa_accounts WHERE waba_id = '1381823417288383' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973'
);
DELETE FROM wa_accounts WHERE waba_id = '1381823417288383' AND tenant_id = 'f8a358c7-0333-4115-a50b-893725955973';