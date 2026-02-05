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
    case
        when buckets.lower_bound is null
            then format('Less than {} seconds', buckets.upper_bound)
        when buckets.upper_bound is null
            then format('More than {} seconds', buckets.lower_bound)
        else format(
            'Between {} and {} seconds',
            buckets.lower_bound,
            buckets.upper_bound
        )
    end as bin,
    buckets.count as num_requests
from (
    select
        unnest(
            histogram_buckets(
                histogram_explicit_bounds,
                histogram_bucket_counts
            )
        ) as buckets
    from (
        select *
        from telemetry_histograms()
        where
            name = 'http.client.request.duration'
            and attribute_string('http.request.method', attributes) = 'GET'
            and attribute_int('http.response.status_code', attributes) = 200
        order by time_unix_nano desc
        limit 1
    )
)
