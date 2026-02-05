/*
 *    Copyright 2026 Mishmash IO UK Ltd.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

export function getMacros(parquetPath) {
  return `
create macro attribute_string(attribute_key, attributes) as (
select
    a.attr_string as value
from (select unnest(attributes) as a)
where a.attr_key = attribute_key
limit 1
);

create macro attribute_int(attribute_key, attributes) as (
select
    a.attr_int as value
from (select unnest(attributes) as a)
where a.attr_key = attribute_key
limit 1
);

create macro attribute_double(attribute_key, attributes) as (
select
    a.attr_double as value
from (select unnest(attributes) as a)
where a.attr_key = attribute_key
limit 1
);


create macro attribute_bool(attribute_key, attributes) as (
select
    a.attr_bool as value
from (select unnest(attributes) as a)
where a.attr_key = attribute_key
limit 1
);

create macro telemetry_logs() as table    
select
    batch_timestamp
    , batch_UUID
    , seq_no
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(logs.resource_attributes) as attr) 
    ) as resource_attributes
    , resource_dropped_attributes_count
    , resource_entity_refs
    , resource_schema_url
    , scope_name
    , scope_version
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(logs.scope_attributes) as attr) 
    ) as scope_attributes
    , scope_dropped_attributes_count
    , time_unix_nano
    , observed_time_unix_nano
    , severity_number
    , severity_text
    , body_type
    , body_string
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(logs.attributes) as attr) 
    ) as attributes
    , dropped_attributes_count
    , flags
    , trace_id
    , span_id
    , event_name
    , log_schema_url
    , is_valid
    , error_message 
from READ_PARQUET('${parquetPath}/logs-*.parquet') as logs;

create macro telemetry_metrics() as table
select
    batch_timestamp
    , batch_UUID
    , seq_no
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(metrics.resource_attributes) as attr) 
    ) as resource_attributes
    , resource_dropped_attributes_count
    , resource_entity_refs
    , resource_schema_url
    , scope_name
    , scope_version
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(metrics.scope_attributes) as attr) 
    ) as scope_attributes
    , scope_dropped_attributes_count
    , name
    , description
    , unit
    , type
    , datapoint_seq_no
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(metrics.attributes) as attr) 
    ) as attributes
    , start_time_unix_nano
    , time_unix_nano
    --, exemplars
    , flags
    , gauge_type
    , gauge_double
    , gauge_int
    , sum_type
    , sum_double
    , sum_int
    , histogram_count
    , histogram_sum
    , histogram_bucket_counts
    , histogram_explicit_bounds
    , histogram_min
    , histogram_max
    , exponential_histogram_count
    , exponential_histogram_sum
    , exponential_histogram_scale
    , exponential_histogram_zero_count
    , exponential_histogram_positive
    , exponential_histogram_negative
    , exponential_histogram_min
    , exponential_histogram_max
    , exponential_histogram_zero_threshold
    , summary_count
    , summary_sum
    , summary_quantile_values
    , aggregation_temporality
    , is_monotonic
    , metric_schema_url
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(metrics.metric_metadata) as attr) 
    ) as metadata
    , is_valid
    , error_message
from READ_PARQUET('${parquetPath}/metrics-*.parquet') as metrics;

create macro telemetry_gauges() as table
select
    * exclude (
        sum_type
        , sum_double
        , sum_int
        , histogram_count
        , histogram_sum
        , histogram_bucket_counts
        , histogram_explicit_bounds
        , histogram_min
        , histogram_max
        , exponential_histogram_count
        , exponential_histogram_sum
        , exponential_histogram_scale
        , exponential_histogram_zero_count
        , exponential_histogram_positive
        , exponential_histogram_negative
        , exponential_histogram_min
        , exponential_histogram_max
        , exponential_histogram_zero_threshold
        , summary_count
        , summary_sum
        , summary_quantile_values
        , aggregation_temporality
        , is_monotonic
    )
from telemetry_metrics()
where type = 'GAUGE';

create macro telemetry_sums() as table
select
    * exclude (
        gauge_type
        , gauge_double
        , gauge_int
        , histogram_count
        , histogram_sum
        , histogram_bucket_counts
        , histogram_explicit_bounds
        , histogram_min
        , histogram_max
        , exponential_histogram_count
        , exponential_histogram_sum
        , exponential_histogram_scale
        , exponential_histogram_zero_count
        , exponential_histogram_positive
        , exponential_histogram_negative
        , exponential_histogram_min
        , exponential_histogram_max
        , exponential_histogram_zero_threshold
        , summary_count
        , summary_sum
        , summary_quantile_values
    )
from telemetry_metrics()
where type = 'SUM';

create macro telemetry_histograms() as table
select
    * exclude (
        gauge_type
        , gauge_double
        , gauge_int
        , sum_type
        , sum_double
        , sum_int
        , exponential_histogram_count
        , exponential_histogram_sum
        , exponential_histogram_scale
        , exponential_histogram_zero_count
        , exponential_histogram_positive
        , exponential_histogram_negative
        , exponential_histogram_min
        , exponential_histogram_max
        , exponential_histogram_zero_threshold
        , summary_count
        , summary_sum
        , summary_quantile_values
        , is_monotonic
    )
from telemetry_metrics()
where type = 'HISTOGRAM';

create macro histogram_buckets(histogram_explicit_bounds, histogram_bucket_counts) as
array(
    select {
        'lower_bound': element1
        , 'upper_bound': element2
        , 'count': element3
    } from (
        select unnest(
            list_zip(
                array_prepend(null, histogram_explicit_bounds),
                histogram_explicit_bounds,
                histogram_bucket_counts
            ),
            recursive := true
        )
    )
);

create macro telemetry_traces() as table
select
    batch_timestamp
    , batch_UUID
    , seq_no
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(traces.resource_attributes) as attr) 
    ) as resource_attributes
    , resource_dropped_attributes_count
    , resource_entity_refs
    , resource_schema_url
    , scope_name
    , scope_version
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(traces.scope_attributes) as attr) 
    ) as scope_attributes
    , scope_dropped_attributes_count
    , trace_id
    , span_id
    , trace_state
    , parent_span_id
    , flags
    , name
    , kind
    , start_time_unix_nano
    , end_time_unix_nano
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(traces.attributes) as attr) 
    ) as attributes
    , dropped_attributes_count
    --, events
    , dropped_events_count
    --, links
    , dropped_links_count
    , status
    , span_schema_url
    , is_valid
    , error_message
from READ_PARQUET('${parquetPath}/traces-*.parquet') as traces;

create macro telemetry_profiles() as table
select
    batch_timestamp
    , batch_UUID
    , resource_seq_no
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(profiles.resource_attributes) as attr) 
    ) as resource_attributes
    , resource_dropped_attributes_count
    , resource_entity_refs
    , resource_schema_url
    , scope_seq_no
    , scope_name
    , scope_version
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(profiles.scope_attributes) as attr) 
    ) as scope_attributes
    , scope_dropped_attributes_count
    , profile_schema_url
    , profile_seq_no
    , profile_id
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(profiles.profile_attributes) as attr) 
    ) as profile_attributes
    , profile_dropped_attributes_count
    , original_payload_format
    , original_payload
    , time_unix_nano
    , duration_nano
    , period_type
    , period
    , sample_seq_no
    --, stack
    , array(
        select {
                'attr_key': attr.key, 
                'attr_string': attr.value.string_value,
                'attr_int': attr.value.int_value,
                'attr_bool': attr.value.bool_value,
                'attr_double': attr.value.double_value,
                'attr_bytes': attr.value.bytes_value,
                'attr_array': attr.value.array_value,
                'attr_kvlist': attr.value.kvlist_value
        } from (select unnest(profiles.attributes) as attr) 
    ) as attributes
    , timestamp_unix_nano
    , trace_id
    , span_id
    , value_seq_no
    , value
    , sample_type
    , is_valid
    , error_message
from READ_PARQUET('${parquetPath}/profiles-*.parquet') as profiles;
`
}
