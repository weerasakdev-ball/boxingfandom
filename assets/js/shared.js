const BASE_PATHS = ['../../data/boxers/', '../data/boxers/', './data/boxers/'];

function getCloudinaryUrl(imgId, width, height) {
    if (!imgId || imgId === "ไม่ระบุ" || imgId === "ยังไม่มีข้อมูล" || imgId.trim() === "" || imgId === "noname") {
        return "/assets/images/noname.jpg";
    }
    if (imgId.startsWith('http') || imgId.includes('assets/')) {
        return imgId;
    }
    const cleanImgId = imgId.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const transform = `c_fill,g_face,h_${height},w_${width},f_auto,q_auto`;
    return `https://res.cloudinary.com/dpvyl7nan/image/upload/${transform}/v1/${encodeURIComponent(cleanImgId)}`;
}

async function fetchJSON(fileName) {
    const encoded = encodeURIComponent(fileName);
    for (const base of BASE_PATHS) {
        try {
            const res = await fetch(base + encoded);
            if (res.ok) return res.json();
        } catch (e) {}
    }
    return null;
}
