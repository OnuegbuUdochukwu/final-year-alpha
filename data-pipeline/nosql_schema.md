# NoSQL Database Schema for Raw Job Postings

This document corresponds to Phase 1.2.2 and defines the document pipeline structure for the MongoDB raw data store. 
It leverages both NLP ingestion structures and state-management fields to support Airflow DAGs.

## Collection: `RawJobDescriptions`

### Expected Document JSON Structure:
```json
{
  "_id": "<ObjectId>",
  "source": "<string> (e.g., 'Indeed', 'LinkedIn')",
  "external_id": "<string> (ID from source API or Dataset)",
  "job_title": "<string>",
  "company": "<string>",
  "location": {
    "city": "<string>",
    "is_remote": "<boolean>"
  },
  "raw_text": "<string> (Full Unprocessed Description)",
  "posted_at": "<ISODate>",
  "ingested_at": "<ISODate>",
  "processing_status": "<string> ('pending', 'completed', 'failed')"
}
```

### Necessary Indexes:

1. **Uniqueness Guarantee (Compound Index)**:
   Prevents the data ingestion script from accidentally duplicating jobs on multiple runs.
   ```javascript
   db.RawJobDescriptions.createIndex(
       { "external_id": 1, "source": 1 }, 
       { unique: true }
   )
   ```

2. **Pipeline State (Single Field Index)**:
   Allows Apache Airflow to instantly find jobs that haven't been processed by the NLP model yet.
   ```javascript
   db.RawJobDescriptions.createIndex({ "processing_status": 1 })
   ```

3. **Data Management & Chronological Processing (Single Field Index)**:
   Helps sort by newest ingested jobs.
   ```javascript
   db.RawJobDescriptions.createIndex({ "ingested_at": -1 })
   ```

4. **Keyword Searching (Text Index)**:
   Enables powerful out-of-the-box full-text search capability.
   ```javascript
   db.RawJobDescriptions.createIndex({ "job_title": "text", "raw_text": "text" })
   ```
