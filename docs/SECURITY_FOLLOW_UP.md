# Security Follow-up Plan

Tài liệu này chuyển kết quả Codex Security scan tháng 06/2026 thành backlog có thể thực thi và kiểm chứng. Mục tiêu là đóng cả hai finding đã xác nhận, ba candidate SSRF còn thiếu bằng chứng, các control Cloudflare ngoài repository và các khoảng trống vận hành/CI.

## Nguyên tắc đóng hạng mục

Một hạng mục chỉ được đánh dấu `Closed` khi đồng thời có:

1. thay đổi code hoặc cấu hình đã được review;
2. test hồi quy tự động;
3. bằng chứng trên preview hoặc production phù hợp với mức rủi ro;
4. observability/alert tương ứng nếu lỗi có thể tái diễn;
5. đường rollback được ghi lại.

Không đóng finding chỉ vì code đã merge. Với control nằm ngoài repository này, phải liên kết commit/config export/evidence từ hệ thống sở hữu control đó.

## Bảng tổng hợp

| ID | Hạng mục | Mức ưu tiên | Trạng thái | Phụ thuộc | Definition of Done chính |
|---|---|---:|---|---|---|
| SEC-01 | Deploy bản sửa empty page và HTML cache poisoning | P0 | Code merged; chưa xác minh production | Cloudflare deploy access | Production không còn empty page; playback URL `no-store`; cache mobile/desktop tách biệt |
| SEC-02 | Xóa hiệu lực cache HTML cũ sau deployment | P0 | Open | SEC-01 | Cache key/version mới hoạt động tại các POP được kiểm tra; không còn response từ version cũ |
| SEC-03 | Khóa SSRF tại `img.bluesia.net` | P0 | Needs follow-up | Source/config của image service | Allowlist + DNS/IP + redirect validation + response limits được test đầy đủ |
| SEC-04 | Chặn URL ảnh nguy hiểm trước khi ký tại FilmBluesia | P1 | Open | Danh sách host hợp lệ | HOME/movie/search không thể tạo signed URL ngoài policy |
| SEC-05 | Rate limit và abuse control cho search API | P1 | Open | Cloudflare zone access, traffic baseline | Rule được triển khai, có log/alert và không gây false positive đáng kể |
| SEC-06 | Production verification cho search bounds | P1 | Code merged; chưa xác minh production | SEC-01 | Input âm, vô hạn, phân số và quá lớn không vượt policy `page >= 1`, `12 <= limit <= 64` |
| SEC-07 | Dependency and supply-chain gate | P1 | Open | CI/network registry access | Audit sạch theo policy; automated update và CI gate hoạt động |
| SEC-08 | Security observability và runbook | P1 | Open | Logging/alert destination | Có dashboard, alert, owner và quy trình xử lý cho bốn failure mode chính |
| SEC-09 | Browser security hardening cho iframe/playback | P2 | Candidate đã rejected; defense-in-depth | Kiểm thử provider compatibility | CSP/iframe permissions tối thiểu mà playback vẫn hoạt động |
| SEC-10 | Security regression suite trong CI | P1 | Open | CI workflow | Các regression test bắt buộc trước merge/deploy |
| SEC-11 | Rescan sau remediation | P1 | Open | SEC-01 đến SEC-10 | Không còn finding reportable; deferred SSRF có closure evidence |

## P0 — containment và production closure

### SEC-01: Deploy và xác minh bản sửa đã merge

Phạm vi commit: `95643cd` (`fix empty home and cache isolation`).

Việc cần làm:

- Deploy đúng commit lên preview trước, sau đó production theo quy trình hiện có.
- Xác nhận binding `WORKER_VERSION` thay đổi theo deployment; không dùng một giá trị tĩnh giữa hai bản phát hành.
- Kiểm tra `/` trả HTML có hero và danh sách phim, không phải HTTP 200 rỗng.
- Gửi một request `/movie/<slug>` có `server`, `ep`, `player`, `mirror` hoặc `play`; yêu cầu response có `Cache-Control: no-store` và `X-Film-Bluesia-Cache: HTML_CACHE_BYPASS_PLAYBACK_VARIANT`.
- Gửi request movie mặc định bằng mobile và desktop User-Agent; xác nhận hai cache variant độc lập. Request lặp lại chỉ được hit đúng variant của nó.
- Xác nhận không autoplay và iframe vẫn chỉ mount sau thao tác Play.

Definition of Done:

- Bằng chứng gồm deployment ID/commit, timestamp, raw headers và hash/body marker của từng probe.
- Home page có nội dung tại desktop và mobile.
- Không response playback-bearing nào đi vào shared HTML cache.
- Có rollback command hoặc deployment ID của bản trước.

### SEC-02: Vô hiệu hóa cache HTML dễ bị nhiễm độc

Ưu tiên cơ chế versioned key qua `WORKER_VERSION`. Chỉ purge có mục tiêu khi vẫn quan sát thấy response version cũ; tránh purge toàn bộ zone nếu không cần thiết.

Việc cần làm:

- Ghi lại `X-Film-Bluesia-HTML-Cache-Version` trước và sau deploy.
- Probe nhiều route home/list/movie và kiểm tra version mới.
- Kiểm tra ít nhất hai vị trí mạng/POP nếu có sẵn công cụ giám sát phân tán.
- Nếu version cũ còn phục vụ, purge các URL/tag liên quan theo cơ chế Cloudflare hiện dùng, rồi probe lại.

Definition of Done: không còn header hoặc body marker thuộc cache version dễ bị nhiễm độc trong cửa sổ kiểm tra đã thống nhất.

### SEC-03: Khóa SSRF tại `img.bluesia.net`

Đây là khoảng trống nghiêm trọng nhất còn lại vì implementation của image service không nằm trong repository này. Cần mở issue/PR ở repository sở hữu `img.bluesia.net` và liên kết bằng chứng về đây.

Control bắt buộc tại nơi thực hiện outbound fetch:

- Chỉ chấp nhận `https:`; từ chối URL có credentials, fragment, port ngoài policy hoặc hostname không hợp lệ.
- Dùng allowlist exact hostname/suffix có boundary rõ ràng cho các nguồn ảnh thực tế. Không dùng kiểm tra kiểu `endsWith("trusted.com")` thiếu dấu chấm biên.
- Chuẩn hóa hostname bằng URL parser, lowercase và IDNA trước khi so khớp.
- Resolve DNS và từ chối loopback, private, link-local, multicast, unspecified, documentation/test ranges và địa chỉ nội bộ tương đương cho cả IPv4/IPv6.
- Không tự động follow redirect. Mỗi hop phải được parse, allowlist, resolve và kiểm tra IP lại; giới hạn số hop.
- Chống DNS rebinding bằng cách bảo đảm destination thực tế khớp destination đã validate hoặc bằng egress allowlist ở tầng mạng/platform.
- Giới hạn timeout, số byte tải xuống, kích thước ảnh sau decode, số pixel, content type và định dạng. Không tin chỉ `Content-Type` từ upstream.
- Không phục vụ SVG/HTML hoặc nội dung active dưới image content type nếu pipeline không sanitize an toàn.
- Không log HMAC/signature hoặc signed URL đầy đủ.

Test bắt buộc:

- `127.0.0.1`, `0.0.0.0`, RFC1918, link-local, IPv6 loopback/link-local và IPv4-mapped IPv6.
- Decimal/hex/octal IP representation nếu URL parser chấp nhận.
- Hostname allowlist giả như `trusted.example.attacker.tld`.
- Redirect từ host hợp lệ sang private IP và redirect chain quá dài.
- DNS trả nhiều IP, thay đổi IP giữa các lần resolve và CNAME sang vùng cấm.
- Response quá lớn, slow response, decompression/image bomb, MIME mismatch và HTML giả ảnh.

Definition of Done:

- Tất cả test âm bị từ chối trước khi có subrequest nguy hiểm.
- Test dương cho từng host ảnh đang sử dụng vẫn hoạt động.
- Có egress log cho destination đã chuẩn hóa nhưng không chứa secret.
- Ba candidate `SEC-SSRF-IMG-HOME`, `SEC-SSRF-IMG-MOVIE`, `SEC-SSRF-IMG-SEARCH` có evidence riêng, không đóng gộp bằng một nhận xét chung.

## P1 — preventive controls

### SEC-04: Validate URL trước khi tạo chữ ký

Defense-in-depth trong repository FilmBluesia:

- Thêm một policy helper duy nhất trong `lib/image-cache.ts` hoặc module kế cận.
- Chỉ ký URL ảnh có scheme/host/path phù hợp với nguồn OPhim/TMDB đã quan sát và được phê duyệt.
- Khi URL không đạt policy, fallback có kiểm soát: bỏ ảnh hoặc dùng placeholder; không fallback sang raw URL nguy hiểm.
- Giữ invariant cache chia sẻ: cache key vẫn chỉ phụ thuộc normalized upstream URL và variant `m|d`, không thêm domain frontend hoặc route.
- Thêm fixture cho cả HOME, movie và search để chứng minh ba entrypoint đều dùng cùng policy.

Definition of Done: không route nào có thể phát hành signed image URL cho destination ngoài allowlist, kể cả khi metadata upstream bị kiểm soát.

### SEC-05: Rate limit search API tại edge

Không hard-code threshold từ phỏng đoán. Trước tiên lấy baseline request rate, burst, cache miss và error rate; sau đó đặt rule theo traffic thật.

Thiết kế rule:

- Match chính xác `/api/ophim/search` và method hợp lệ.
- Phân biệt burst ngắn của người dùng thật với automation kéo dài.
- Bắt đầu ở chế độ log/count nếu nền tảng hỗ trợ, đánh giá false positive rồi mới chuyển block/challenge.
- Có ngoại lệ hẹp cho health check hoặc trusted automation; không dùng allowlist IP rộng.
- Response bị giới hạn phải rõ ràng và không được cache như response thành công.
- Theo dõi request count, action count, Worker CPU/subrequests, upstream latency và tỷ lệ 429/challenge.

Definition of Done: rule/config export được lưu hoặc liên kết, dashboard có dữ liệu, alert có owner, và test burst kiểm soát chứng minh rule hoạt động.

### SEC-06: Xác minh search bounds trên production

Probe read-only với các input:

- `page=-9`, `page=Infinity`, `page=3.9`;
- `limit=-1`, `limit=NaN`, `limit=12.9`, `limit=1000000`;
- keyword rỗng và keyword broad nhưng không load-test.

Xác nhận outbound behavior qua log/trace hoặc response pagination: page là integer tối thiểu 1, limit là integer trong 12..64. Không gửi tải lặp lại có thể ảnh hưởng upstream.

### SEC-07: Dependency và supply-chain gate

- Chạy audit production dependencies trong CI với registry/network được phê duyệt.
- Thiết lập policy fail cho vulnerability có khả năng reach runtime; advisory không reachable phải có waiver ghi owner, lý do và ngày hết hạn.
- Bật automated dependency updates theo nhóm nhỏ, tránh PR nâng toàn bộ stack không liên quan.
- Luôn dùng lockfile và clean install trong CI.
- Kiểm tra secret scanning và dependency review cho pull request.
- Pin major runtime/adapter upgrades vào PR riêng có build và preview smoke test.

Definition of Done: CI trên `main` chạy thành công; không advisory runtime chưa xử lý hoặc waiver hết hạn.

### SEC-08: Observability và incident runbook

Theo dõi tối thiểu:

1. `HOME` trả zero items hoặc throw all-sources-empty;
2. KV write/budget persistence failure;
3. playback cache bypass, HTML cache miss/hit/write theo cache version;
4. search clamp/rate-limit action và image URL rejection.

Alert phải tránh chứa token, HMAC, full signed URL hoặc raw admin credential. Mỗi alert có owner, severity, dashboard link, bước kiểm tra, rollback và điều kiện đóng incident.

### SEC-10: Regression suite bắt buộc trong CI

Các command tối thiểu:

```text
npm.cmd run build
npm.cmd run test:kv-write-resilience
npm.cmd run test:ophim-latest-order
npm.cmd run test:image-normalization
```

Bổ sung test tự động cho:

- hai request cache-poisoning xung đột;
- mobile/desktop cache-key isolation;
- playback-bearing URL luôn `no-store`;
- SSRF allowlist/IP/redirect matrix;
- home không cache HTTP 200 khi toàn bộ catalog rỗng.

CI phải chạy trên pull request và branch bảo vệ trước merge.

## P2 — defense in depth

### SEC-09: Iframe và browser policy

Candidate iframe đã bị loại vì chưa có ordinary-attacker control hoặc parent-origin privilege crossing. Tuy vậy nên kiểm thử policy tối thiểu:

- CSP `frame-src` chỉ chứa provider cần thiết;
- `frame-ancestors` giới hạn site bị nhúng bởi origin khác;
- iframe `allow` chỉ cấp capability playback thực sự cần;
- đánh giá `sandbox` theo compatibility của từng provider; không bật đồng thời capability làm mất ý nghĩa sandbox nếu không có lý do;
- giữ nguyên explicit Play, no autoplay và centralized URL validation.

Không triển khai policy mới thẳng production nếu chưa có playback compatibility matrix trên desktop, Android và iOS.

## Rollout đề xuất

### Giai đoạn A — trong ngày

1. SEC-01: preview + production deploy.
2. SEC-02: cache-version verification/purge có mục tiêu.
3. Mở owner/repository cho SEC-03; nếu chưa xác định được source của `img.bluesia.net`, tạm dừng ký URL ngoài allowlist tại FilmBluesia.

### Giai đoạn B — 1 đến 3 ngày

1. SEC-03 và SEC-04: SSRF controls hai lớp.
2. SEC-05 và SEC-06: edge rate limit + production verification.
3. SEC-08: dashboard/alert/runbook.

### Giai đoạn C — trong tuần

1. SEC-07 và SEC-10: CI/supply-chain gates.
2. SEC-09: browser defense-in-depth sau compatibility test.
3. SEC-11: chạy lại repository scan và attack-path validation.

## Rescan và tiêu chí kết thúc chương trình

Chạy lại security scan từ commit production cuối cùng, không chỉ từ working tree. Chương trình follow-up hoàn tất khi:

- hai finding medium cũ có production closure evidence;
- ba SSRF candidate được xác nhận an toàn bằng test của image fetcher, hoặc được báo cáo thành finding mới với remediation hoàn chỉnh;
- search API có application bound và edge abuse control;
- dependency audit và regression suite là required checks;
- không còn finding `reportable`, candidate `deferred` không owner, hoặc waiver không có ngày hết hạn;
- báo cáo rescan Markdown/HTML được liên kết từ tài liệu này.

## Evidence checklist

Lưu các bằng chứng sau trong issue/PR hoặc thư mục QA phù hợp, không commit secret:

- commit SHA và deployment ID;
- raw response headers đã redact;
- cache-version và POP/timestamp;
- test output/CI run URL;
- Cloudflare rule/config export đã loại account/token nhạy cảm;
- image SSRF test matrix và kết quả;
- dashboard/alert screenshot hoặc link nội bộ;
- rescan report và candidate closure receipts.

## Hạn chế khi soạn kế hoạch

Tài liệu Cloudflare trực tuyến không truy xuất được trong phiên lập kế hoạch do endpoint tìm kiếm trả HTTP 403. Vì vậy kế hoạch không cố định threshold, pricing tier hoặc tên field API có thể thay đổi. Trước khi triển khai SEC-02/SEC-05/SEC-08, đối chiếu lại tài liệu Cloudflare chính thức và schema Wrangler đang cài trong repository.
