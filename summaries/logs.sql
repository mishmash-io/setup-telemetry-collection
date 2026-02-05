--
--    Copyright 2026 Mishmash IO UK Ltd.
--
--  Licensed under the Apache License, Version 2.0 (the "License");
--  you may not use this file except in compliance with the License.
--  You may obtain a copy of the License at
--
--      http://www.apache.org/licenses/LICENSE-2.0
--
--  Unless required by applicable law or agreed to in writing, software
--  distributed under the License is distributed on an "AS IS" BASIS,
--  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
--  See the License for the specific language governing permissions and
--  limitations under the License.
--

select
    severity_text as severity,
    scope_name as scope,
    attribute_string('code.file.path', attributes) as file_name,
    attribute_string('code.function.name', attributes) as function_name,
    attribute_int('code.line.number', attributes) as line_number,
    body_string as log_message
from telemetry_logs()
where severity_text in ('warn', 'error', 'info')
order by time_unix_nano desc
limit 10
