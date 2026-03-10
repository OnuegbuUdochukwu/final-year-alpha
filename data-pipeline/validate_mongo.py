import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.getenv("MONGODB_URL"))
db = client['JobData']
collection = db.RawJobDescriptions

count = collection.count_documents({})
sample = collection.find_one()

print(f"\n--- MONGODB VALIDATION ---")
print(f"Total documents in RawJobDescriptions: {count}")
print("\nSample Document Structure:")
if sample:
    # Truncate raw text for display
    if 'raw_text' in sample:
        sample['raw_text'] = sample['raw_text'][:150] + "... [TRUNCATED]"
    import pprint
    pprint.pprint(sample)
else:
    print("Collection is empty!")
