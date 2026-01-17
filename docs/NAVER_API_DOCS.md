# Naver API Development Standard

## Part 1: Naver Search Ad API (RelKwdStat)

### 1) Endpoints
- **Base URL:** `https://api.naver.com`
- **GET /keywordstool** — Keyword Tool (RelKwdStat). Returns related keywords and metrics given hint keywords.

### 2) Authentication Headers (Required for all requests)
- `X-Timestamp`: Current time (Epoch ms).
- `X-API-KEY`: Issued Access License.
- `X-Customer`: Ad Account Customer ID.
- `X-Signature`: **HMAC-SHA256(secret, "{timestamp}.{METHOD}.{URI}")** → Base64 Encoded.
    - Example: Message `"1696156798000.GET./keywordstool"` signed then Base64 encoded.
    - **Implementation Tip:** URI uses strictly the path (excluding query string). Timestamp must match the header value.

### 3) Request Parameters
| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `hintKeywords` | string | ✔ | Base keywords (Max 5, comma-separated) |
| `showDetail` | `0`/`1` | Recommended | Set to `1` to include detailed metrics (Clicks, CTR, Competition, Ad Count) |
| `siteId` | string | | Optional: Site-based recommendation |
| `biztpId` | string | | Optional: Industry-based recommendation |
| `month` | string | | Optional: Seasonal month |
| `event` | string | | Optional: Seasonal theme |

### 4) Response Schema (Key Field Mapping)
Mapping logic for `keywordList` items:

| Our Column | Naver Field | Description |
| --- | --- | --- |
| **Keyword** | `relKeyword` | Related keyword text |
| **PC Search Count** | `monthlyPcQcCnt` | Recent monthly PC search count (string, `< 10` possible) |
| **Mobile Search Count** | `monthlyMobileQcCnt` | Recent monthly Mobile search count (string, `< 10` possible) |
| **Avg. Click Count (PC)** | `monthlyAvePcClkCnt` | Recent monthly avg ad clicks (PC) |
| **Avg. Click Count (Mobile)** | `monthlyAveMobileClkCnt` | Recent monthly avg ad clicks (Mobile) |
| **PC CTR** | `monthlyAvePcCtr` | Recent monthly avg CTR (PC, % string) |
| **Mobile CTR** | `monthlyAveMobileCtr` | Recent monthly avg CTR (Mobile, % string) |
| **Ad Count** | `plAvgDepth` | Avg exposed ad count (PC Integrated Search) |
| **Competition** | `compIdx` | Competition level (Low/Mid/High) |

### 5) Data Normalization Rules
- **String parsing**: All metrics are strings. `< 10` should be converted to number (e.g., 10 or 0 or 5 depending on business rule).
- **Total Search**: `monthlyPcQcCnt + monthlyMobileQcCnt` (Note: converting to number first).
- **CTR**: Returned as percentage string (e.g., `"2.86"`). Treat as 2.86%.

### 6) Rate Limiting & 429 Handling
- **RelKwdStat** is limited to approx 1/5 ~ 1/6 speed of other operations.
- Limit applied per **Customer Account + IP**.
- **On 429**: Wait 5-6x longer than usual. Do not mass retry immediately. Recommended 5 min cooldown.
- **Batch Strategy**: Use `hintKeywords` (max 5) per call. Use strict concurrency control + exponential backoff.

---

## Part 2: Naver Search API (Document Counts)

### 1) Common Auth
- **Base**: `https://openapi.naver.com`
- **Headers**:
    - `X-Naver-Client-Id`: `<CLIENT_ID>`
    - `X-Naver-Client-Secret`: `<CLIENT_SECRET>`
- **Method**: `GET`
- **Quota**: Daily 25,000 requests (Aggregated).

### 2) Service Endpoints
| Service | Endpoint | Key Params |
| --- | --- | --- |
| **Blog** | `/v1/search/blog.json` | `query`, `display`(1~100) |
| **News** | `/v1/search/news.json` | `query`, `display`(1~100) |
| **Cafe** | `/v1/search/cafearticle.json` | `query`, `display`(1~100) |
| **Web** | `/v1/search/webkr.json` | `query`, `display`(1~100) |
| **Shop** | `/v1/search/shop.json` | `query`, `display`(1~100) |
| **Doc** | `/v1/search/doc.json` | `query`, `display`(1~100) |

(See full table in original request for others like Book, Image, Local, etc.)

### 3) Response Structure
```json
{
  "total": 12345,
  "start": 1,
  "display": 10,
  "items": [...]
}
```
- **total**: Total document count (Used for Golden Ratio calculation).

### 4) Caching & Architecture
- **Backend Proxy**: Never call from frontend. Manage keys on server.
- **Caching**: Good to cache `total` counts for hours/days as they don't change drastically.
- **Error Handling**: 429 -> Exponential backoff.

---

## Part 3: Implementation Checklist
1. **Env Vars**: `SEARCHAD_BASE`, `SEARCHAD_API_KEY`, etc.
2. **Signature Utility**: `HMAC-SHA256` implementation.
3. **Response Parsing**: Handle `< 10`, remove commas, parse floats.
4. **Batching**: 5 keywords per `RelKwdStat` request.
5. **Combined Usage**:
    - Step 1: `RelKwdStat` to find related keywords and search volume.
    - Step 2: `Search API` (Blog/Cafe/Web) to find document counts for Golden Ratio.
