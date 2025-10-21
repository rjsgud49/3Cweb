// DashboardLookup.tsx
import { useEffect, useRef, useState } from "react";
import SubmitLinks from "../pages/SubmitLinks";
/**
 * 요구사항
 * - OAuth 동의화면: Test users에 현재 Gmail 추가
 * - OAuth Client: Authorized JS origins에 http://localhost:5173(또는 실제 포트) 추가, Redirect URIs 비움
 * - 실행 계정: 대상 스프레드시트 "편집" 권한 필요(B2/C2 쓰기 위해)
 */

declare global {
    interface Window {
        google?: any;
    }
}

// ===== env =====
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SHEET_ID = import.meta.env.VITE_SHEET_ID as string;
const SHEET_NAME = (import.meta.env.VITE_SHEET_NAME as string) || "";
const SHEET_GID = import.meta.env.VITE_SHEET_GID
    ? Number(import.meta.env.VITE_SHEET_GID)
    : undefined;
/** 기본값을 A4:P27로 변경(하단 3행 제외) */
const RESULT_RANGE = (import.meta.env.VITE_RESULT_RANGE as string) || "A4:P27";

// ===== helpers =====
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 시트명 안의 작은따옴표 이스케이프 후 '시트명'!A1:B2 형태로 생성 */
const a1 = (title: string, range: string) =>
    `'${String(title).replace(/'/g, "''")}'!${range}`;

/** 스프레드시트 메타에서 gid로 title 찾기 (없으면 에러) */
async function getSheetTitleByGid(
    accessToken: string,
    spreadsheetId: string,
    gid: number
): Promise<string> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const props = (json.sheets || []).map((s: any) => s.properties);
    const hit = props.find((p: any) => p.sheetId === gid);
    if (!hit) {
        throw new Error(
            `sheetId ${gid} not found. Available: ` +
            props.map((p: any) => `${p.sheetId}:${p.title}`).join(", ")
        );
    }
    return hit.title as string;
}

/** Sheets API: B2:C2에 name, birth(6자리) 쓰기 (batchUpdate) */
async function writeInputs(
    accessToken: string,
    spreadsheetId: string,
    sheetTitle: string,
    name: string,
    birth6: string
) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const body = {
        valueInputOption: "USER_ENTERED",
        data: [
            {
                range: a1(sheetTitle, "B2:C2"),
                majorDimension: "ROWS",
                values: [[name, birth6]],
            },
        ],
        includeValuesInResponse: false,
    };

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("WRITE error", res.status, text);
        throw new Error(text);
    }
}

/** Sheets API: 결과 범위 읽기 (batchGet) */
async function readResult(
    accessToken: string,
    spreadsheetId: string,
    sheetTitle: string,
    resultRange: string
) {
    const full = a1(sheetTitle, resultRange);
    const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet` +
        `?ranges=${encodeURIComponent(full)}` +
        `&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const text = await res.text();
        console.error("READ error", res.status, text);
        throw new Error(text);
    }

    const json = await res.json();
    const values = (json.valueRanges?.[0]?.values ?? []) as string[][];
    return values;
}

/** 글자수에 따라 폰트크기 자동 조절(대략적인 핏) */
function fitFontSize(text: string) {
    const len = String(text ?? "").length;
    if (len <= 6) return 14;
    if (len <= 10) return 13;
    if (len <= 18) return 12;
    if (len <= 28) return 11;
    if (len <= 40) return 10;
    return 9;
}

/* =========================
 *     로컬스토리지 캐시
 * ========================= */
type CachePayload = {
    sheetId: string;
    sheetTitle: string;
    range: string;
    name: string;
    birth6: string;
    values: string[][];
    ts: number; // 저장 시각(ms)
};

const LS_LAST = "dashlookup:last"; // 마지막 조회 키 전체를 저장
const LS_PREFIX = "dashlookup:cache:";

// 캐시 키: 시트ID|타이틀|범위|이름|생년6
const makeCacheKey = (p: {
    sheetId: string;
    sheetTitle: string;
    range: string;
    name: string;
    birth6: string;
}) =>
    `${LS_PREFIX}${p.sheetId}|${p.sheetTitle}|${p.range}|${p.name}|${p.birth6}`;

// TTL을 쓰고 싶다면 여기서 제한(밀리초). 무제한이면 null
const CACHE_TTL: number | null = null; // 예: 1000 * 60 * 60 (1시간)

function loadFromCache(key: string): CachePayload | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachePayload;
        if (CACHE_TTL && Date.now() - parsed.ts > CACHE_TTL) {
            // 만료된 캐시 삭제
            localStorage.removeItem(key);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function saveToCache(key: string, payload: CachePayload) {
    localStorage.setItem(key, JSON.stringify(payload));
    // 마지막 조회 기준 저장(다시 열었을 때 자동 표시)
    localStorage.setItem(LS_LAST, key);
}

function loadLastCache(): CachePayload | null {
    const lastKey = localStorage.getItem(LS_LAST);
    if (!lastKey) return null;
    return loadFromCache(lastKey);
}

export default function DashboardLookup() {
    const [name, setName] = useState("");
    const [birth, setBirth] = useState(""); // "080225"
    const [values, setValues] = useState<string[][]>([]);
    const [loading, setLoading] = useState(false);
    const [sheetTitleMemo, setSheetTitleMemo] = useState<string>(""); // 캐시 키 생성을 위해 기억
    const tokenRef = useRef<string | null>(null);

    // 페이지 처음 로드 시 GIS + 마지막 캐시 불러오기
    useEffect(() => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        s.onload = () => {
            console.log("GIS loaded", { origin: window.location.origin });
            console.log("ENV", { CLIENT_ID, SHEET_ID, SHEET_NAME, SHEET_GID, RESULT_RANGE });
            if (!CLIENT_ID) console.error("❌ VITE_GOOGLE_CLIENT_ID is empty");
            if (!SHEET_ID) console.error("❌ VITE_SHEET_ID is empty");
        };
        document.body.appendChild(s);

        // 마지막 결과 자동 표시
        const last = loadLastCache();
        if (last) {
            setValues(last.values);
            setName(last.name);
            setBirth(last.birth6);
            setSheetTitleMemo(last.sheetTitle);
            console.log("Loaded from cache (last):", last);
        }
    }, []);

    // get OAuth token
    const getToken = async () => {
        return new Promise<string>((resolve, reject) => {
            if (!window.google) return reject(new Error("GIS not loaded"));
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: "https://www.googleapis.com/auth/spreadsheets",
                ux_mode: "popup",
                callback: (resp: any) => {
                    console.log("GIS resp:", resp);
                    if (resp?.access_token) return resolve(resp.access_token);
                    reject(new Error(resp?.error || "access_denied"));
                },
            });
            client.requestAccessToken();
        });
    };

    const ensureToken = async () => {
        if (!tokenRef.current) tokenRef.current = await getToken();
        return tokenRef.current!;
    };

    // gid가 있으면 title 자동 조회
    const ensureSheetTitle = async (accessToken: string) => {
        if (SHEET_GID !== undefined && !Number.isNaN(SHEET_GID)) {
            const t = await getSheetTitleByGid(accessToken, SHEET_ID, SHEET_GID);
            setSheetTitleMemo(t);
            return t;
        }
        if (!SHEET_NAME) throw new Error("SHEET_NAME or SHEET_GID must be provided");
        setSheetTitleMemo(SHEET_NAME);
        return SHEET_NAME;
    };

    // 캐시 우선 조회(있으면 즉시 표시) → 필요 시 강제 새로고침
    const handleLookup = async () => {
        setValues([]);
        const n = name.trim();
        const b6 = birth.replace(/\D/g, "").slice(-6);
        if (!n || b6.length !== 6) {
            alert("이름과 생년월일 6자리를 입력하세요.");
            return;
        }

        // 0) 캐시 키 계산(시트 타이틀이 필요한데, 아직 모르면 최근 시트 타이틀로 우선 시도)
        let tentativeSheetTitle = sheetTitleMemo || SHEET_NAME || "";
        if (!tentativeSheetTitle && SHEET_GID !== undefined) {
            // 시트 타이틀을 모를 때는 네트워크 토큰/호출이 필요하므로 아래에서 다시 설정됨
            tentativeSheetTitle = "(resolving)";
        }
        const tentativeKey = makeCacheKey({
            sheetId: SHEET_ID,
            sheetTitle: tentativeSheetTitle,
            range: RESULT_RANGE,
            name: n,
            birth6: b6,
        });

        // 1) 캐시 먼저 보여주기(있으면 즉시 UX 개선)
        if (tentativeSheetTitle !== "(resolving)") {
            const cached = loadFromCache(tentativeKey);
            if (cached) {
                setValues(trimBottom3(cached.values));
                console.log("Hit cache:", cached);
            }
        }

        try {
            setLoading(true);
            const token = await ensureToken();
            const title = await ensureSheetTitle(token);

            // 확정된 키로 다시 캐시 확인(위에서 resolving이었을 수 있음)
            const cacheKey = makeCacheKey({
                sheetId: SHEET_ID,
                sheetTitle: title,
                range: RESULT_RANGE,
                name: n,
                birth6: b6,
            });
            const cached = loadFromCache(cacheKey);
            if (cached) {
                setValues(trimBottom3(cached.values));
                console.log("Hit cache(after title resolve):", cached);
                // 캐시만 쓰고 끝낼지 여부는 정책에 따라.
                // 여기서는 "네트워크 최신값으로 갱신"을 시도해 최신성을 유지.
            }

            // 2) 쓰기
            await writeInputs(token, SHEET_ID, title, n, b6);

            // 3) 계산 대기
            await sleep(800);

            // 4) 읽기
            let result = await readResult(token, SHEET_ID, title, RESULT_RANGE);

            // ▼▼▼ 하단 3행(설명영역) 제거 – 범위를 잘못 줘도 안전하게 컷
            const trimmed = trimBottom3(result);
            setValues(trimmed);

            // 5) 캐시에 저장
            saveToCache(cacheKey, {
                sheetId: SHEET_ID,
                sheetTitle: title,
                range: RESULT_RANGE,
                name: n,
                birth6: b6,
                values: result, // 원본 저장(트림 전)
                ts: Date.now(),
            });
        } catch (e: any) {
            console.error(e);
            alert("오류가 발생했습니다. 콘솔을 확인하세요.");
        } finally {
            setLoading(false);
        }
    };

    // 강제 새로고침(캐시 무시하고 네트워크만)
    const handleRefresh = async () => {
        setValues([]);
        const n = name.trim();
        const b6 = birth.replace(/\D/g, "").slice(-6);
        if (!n || b6.length !== 6) {
            alert("이름과 생년월일 6자리를 입력하세요.");
            return;
        }
        try {
            setLoading(true);
            const token = await ensureToken();
            const title = await ensureSheetTitle(token);

            await writeInputs(token, SHEET_ID, title, n, b6);
            await sleep(800);
            let result = await readResult(token, SHEET_ID, title, RESULT_RANGE);
            const trimmed = trimBottom3(result);
            setValues(trimmed);

            const cacheKey = makeCacheKey({
                sheetId: SHEET_ID,
                sheetTitle: title,
                range: RESULT_RANGE,
                name: n,
                birth6: b6,
            });
            saveToCache(cacheKey, {
                sheetId: SHEET_ID,
                sheetTitle: title,
                range: RESULT_RANGE,
                name: n,
                birth6: b6,
                values: result,
                ts: Date.now(),
            });
        } catch (e: any) {
            console.error(e);
            alert("오류가 발생했습니다. 콘솔을 확인하세요.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 720, margin: "24px auto", fontFamily: "system-ui, sans-serif" }}>

            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto auto" }}>
                <input
                    placeholder="이름"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <input
                    placeholder="생년월일(6자리)"
                    value={birth}
                    onChange={(e) => setBirth(e.target.value)}
                />
                <button onClick={handleLookup} disabled={loading}>
                    {loading ? "조회 중..." : "조회(캐시 우선)"}
                </button>
                <button onClick={handleRefresh} disabled={loading} title="캐시 무시하고 새로고침">
                    {loading ? "조회 중..." : "새로고침"}
                </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                {/* 상태 안내 */}
                {sheetTitleMemo && (
                    <div>시트: <b>{sheetTitleMemo}</b> / 범위: <b>{RESULT_RANGE}</b></div>
                )}
            </div>

            <div style={{ marginTop: 16, overflowX: "auto" }}>
                {values.length > 0 ? (
                    <table
                        border={1}
                        cellPadding={6}
                        style={{
                            width: "100%",
                            tableLayout: "fixed",
                            borderCollapse: "collapse",
                        }}
                    >
                        <tbody>
                            {values.map((r, i) => (
                                <tr key={i}>
                                    {r.map((c, j) => (
                                        <td
                                            key={j}
                                            style={{
                                                padding: "6px 8px",
                                                whiteSpace: "normal",
                                                wordBreak: "break-word",
                                                lineHeight: 1.25,
                                                fontSize: `${fitFontSize(c)}px`,
                                            }}
                                            title={c}
                                        >
                                            {c}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ color: "#666" }}>조회 결과가 여기에 표시됩니다.</div>
                )}
            </div>

            <SubmitLinks />
        </div>
        
    );
}

/** 하단 3행 제거(설명 영역 컷) */
function trimBottom3(rows: string[][]): string[][] {
    if (rows.length >= 3) return rows.slice(0, rows.length - 3);
    return rows;
}
