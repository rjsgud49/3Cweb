// SingleLookup.tsx
import { useState } from "react";

const SHEET_ID = import.meta.env.VITE_SHEET_ID;           // 스프레드시트 ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;     // API 키
const RANGE = "시트이름!A:Z";                          // 범위(필요에 맞게)

export default function SingleLookup() {
    const [name, setName] = useState("");
    const [birth, setBirth] = useState(""); // "080225" 같은 6자리
    const [row, setRow] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        setLoading(true);
        setRow(null);
        try {
            const url =
                `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${API_KEY}`;
            const res = await fetch(url);
            const json = await res.json();
            const rows: string[][] = json.values || [];

            // 예: A열=학년, B열=이름, C열=생년월일(6자리)라고 가정
            const found = rows.find(r =>
                (r[1] || "").trim() === name.trim() &&
                (r[2] || "").replace(/\D/g, "").slice(-6) === birth.replace(/\D/g, "").slice(-6)
            );
            setRow(found || null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 560, margin: "24px auto", fontFamily: "sans-serif" }}>
            <h2>단건 조회 (Google Sheets API / Read-only)</h2>
            <div style={{ display: "grid", gap: 8 }}>
                <input placeholder="이름" value={name} onChange={e => setName(e.target.value)} />
                <input placeholder="생년월일(6자리)" value={birth} onChange={e => setBirth(e.target.value)} />
                <button onClick={handleSearch} disabled={loading}>
                    {loading ? "조회 중..." : "조회"}
                </button>
            </div>

            {row && (
                <div style={{ marginTop: 16 }}>
                    <b>조회 결과 행:</b>
                    <pre>{JSON.stringify(row, null, 2)}</pre>
                </div>
            )}
            {!row && !loading && <div style={{ marginTop: 16, color: "#666" }}>결과 없음</div>}
        </div>
    );
}
