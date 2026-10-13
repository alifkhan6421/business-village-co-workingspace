-- Visitors no longer see availability: guests send booking requests and the team confirms them.
-- Signed-in members keep the booking calendar, so authenticated users keep access.
-- Apply after the booking-request release is live (the previous release still shows guests the calendar).
revoke execute on function public.get_busy_slots(text, uuid, timestamptz, timestamptz) from anon, public;
revoke execute on function public.find_available_resources(text, timestamptz, timestamptz) from anon, public;
grant execute on function public.get_busy_slots(text, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.find_available_resources(text, timestamptz, timestamptz) to authenticated;
