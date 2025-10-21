// src/components/SubmitLinks.tsx
import React from "react";

type LinkItem = {
    label: string;
    url: string;
};

type SubmitLinksProps = {
    /** 새 탭으로 열지 여부 (기본값: true) */
    newTab?: boolean;
};

const LINKS: LinkItem[] = [
    { label: "프로젝트 제출", url: "https://forms.gle/QuAx12HubG2gWWbu8" },
    { label: "교내프로그램 참가 제출", url: "https://forms.gle/FEVkuz86X9QEp16s6" },
    { label: "독서감상문 제출", url: "https://forms.gle/WvtANpVGtG7Rz9hE8" },
    { label: "대회참가 제출", url: "https://forms.gle/cZRhXdjHmWzczDPq5" },
    { label: "자격증 취득 제출", url: "https://forms.gle/Q5BHBZQ6cq4aL5mb7" },
];

const baseBtnStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "white",
    cursor: "pointer",
    fontWeight: 600,
    transition: "transform 0.05s ease, box-shadow 0.2s ease",
};

const SubmitLinks: React.FC<SubmitLinksProps> = ({ newTab = true }) => {
    const go = (url: string) => {
        if (newTab) {
            window.open(url, "_blank", "noopener,noreferrer");
        } else {
            window.location.href = url;
        }
    };

    return (
        <div
            style={{
                maxWidth: 720,
                margin: "24px auto",
                padding: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
                background: "#f9fafb",
            }}
        >
            {LINKS.map((item) => (
                <button
                    key={item.url}
                    onClick={() => go(item.url)}
                    style={baseBtnStyle}
                    onMouseDown={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.98)";
                    }}
                    onMouseUp={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                    }}
                    aria-label={`${item.label} 폼으로 이동`}
                >
                    {item.label} → 폼 이동
                </button>
            ))}
        </div>
    );
};

export default SubmitLinks;
