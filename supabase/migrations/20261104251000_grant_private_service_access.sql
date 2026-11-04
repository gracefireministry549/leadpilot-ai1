grant usage on schema private to service_role;
grant select,insert,update,delete on private.auth_rate_limits,private.processed_payment_events to service_role;
grant select,insert,update,delete on public.agent_memory,public.agent_events to service_role;
