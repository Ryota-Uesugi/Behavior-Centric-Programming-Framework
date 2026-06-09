/* ================= ユーティリティ・ヘルパー ================= */

export const dom = {
    create: (tag, className = "", props = {}) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        Object.assign(el, props);
        return el;
    },
    input: (type, name, value, props = {}) => {
        const el = document.createElement("input");
        el.type = type;
        el.name = name;
        if (type === "checkbox") el.checked = (value === true || value === "true");
        else el.value = value || "";
        Object.assign(el, props);
        return el;
    },
    // 入力要素のイベント伝播阻止
    stopProp: (el) => {
        el.addEventListener("mousedown", (e) => e.stopPropagation());
        el.addEventListener("click", (e) => e.stopPropagation());
        return el;
    }
};