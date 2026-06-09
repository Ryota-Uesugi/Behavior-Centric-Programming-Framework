/* ==========================================================================
   API UTILITIES
   ========================================================================== */

export async function fetchTelemetryFields() {
    try {
        const res = await fetch('http://localhost:5000/api/mavlink/last');
        return await res.json();
    } catch (e) {
        return {};
    }
}

export async function fetchSavedcomponents(type) {
    try {
        let url = 'http://localhost:5000/api/settings';
        if (type) {
            url += `?type=${encodeURIComponent(type)}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch components");
        return await res.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function deleteSavedComponent(type, index) {
    try {
        const url = `http://localhost:5000/api/settings/${type}/${index}`;
        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            let reason = "Delete failed";
            try {
                const json = await res.json();
                if (json.reason) reason = json.reason;
            } catch (e) { }
            throw new Error(reason);
        }
        return true;
    } catch (e) {
        console.error("Delete Error:", e);
        alert("削除に失敗しました: " + e.message);
        return false;
    }
}