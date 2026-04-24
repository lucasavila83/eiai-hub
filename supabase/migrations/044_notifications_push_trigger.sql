-- 044_notifications_push_trigger
--
-- Route every in-app notification INSERT through the webhook-intake
-- endpoint so the server can turn it into a browser push. Without this
-- the user would only see the notification inside the tab; once the
-- PWA is backgrounded (or the phone is locked) they'd miss it entirely.
--
-- The intake endpoint already handles the side-effects of messages, BPM
-- events, etc. We're piggy-backing on the same transport — see
-- src/app/api/events/webhook-intake/route.ts, case "notifications".

DROP TRIGGER IF EXISTS notifications_webhook_intake ON notifications;
CREATE TRIGGER notifications_webhook_intake
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_webhook_intake();
