// 固定使用的視覺規範色票系統
const COLOR_PALETTE = ['#e26f63', '#f5d57d', '#ffffff', '#bfc0c0', '#595757', '#f8cfe1', '#a8daf6'];
const subCategoryColors = {};
let colorIndex = 0;

function getSubCategoryColor(subName) {
    if (!subCategoryColors[subName]) {
        subCategoryColors[subName] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
        colorIndex++;
    }
    return subCategoryColors[subName];
}

let globalProcessedData = {
    all: { creative: {}, theoretical: {}, creativeTotal: 0, theoreticalTotal: 0, papers: { creative: [], theoretical: [] } }
};

// 🌟 嚴謹的 CSV 單行解析器：解決「論文名稱中有逗號」導致欄位偏移、分類錯亂的問題
function parseCSVLine(text) {
    let ret = [];
    let inQuote = false;
    let value = '';
    for (let i = 0; i < text.length; i++) {
        let ch = text[i];
        if (inQuote) {
            if (ch === '"') {
                // 處理雙引號跳脫
                if (i + 1 < text.length && text[i + 1] === '"') { value += '"'; i++; } 
                else { inQuote = false; }
            } else { value += ch; }
        } else {
            if (ch === '"') inQuote = true;
            else if (ch === ',') { ret.push(value.trim()); value = ''; }
            else value += ch;
        }
    }
    ret.push(value.trim());
    return ret;
}

// 載入並解析 CSV 檔案
async function loadAndParseCSV() {
    try {
        const response = await fetch('2016-2025臺藝大視傳系研討會論文.csv');
        const csvText = await response.text();
        const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        
        if (lines.length < 2) return;

        const headers = parseCSVLine(lines[0]);
        const yearIdx = headers.findIndex(h => h.includes('年') || h.includes('年度'));
        const groupIdx = headers.findIndex(h => h.includes('組別') || h.includes('類別') || h.includes('組'));
        const subCategoryIdx = headers.findIndex(h => h.includes('子類別') || h.includes('子分類') || h.includes('研究領域'));
        const titleIdx = headers.findIndex(h => h.includes('篇名') || h.includes('題目') || h.includes('論文'));

        let currentYear = ""; // 記憶當前年份，解決 Excel 匯出時後續列年份空白的問題

        for (let i = 1; i < lines.length; i++) {
            const columns = parseCSVLine(lines[i]);
            if (columns.length < 2) continue;

            // 處理年份延續
            const rawYear = columns[yearIdx] || "";
            const yearMatch = rawYear.match(/\d{4}/);
            if (yearMatch) {
                currentYear = yearMatch[0];
            }
            if (!currentYear) continue; // 若找不到年份就跳過這行
            
            const year = currentYear;
            const group = columns[groupIdx] || "";
            const subCat = columns[subCategoryIdx] || "其他";
            const title = titleIdx !== -1 ? columns[titleIdx] : "";

            // 嚴格區分組別，避免混淆
            let groupKey = "";
            if (group.includes("創作")) {
                groupKey = "creative";
            } else if (group.includes("理論")) {
                groupKey = "theoretical";
            } else {
                // 雙重保險：如果類別欄位空白，透過子分類來強制歸類
                if (subCat.includes("創作") || subCat.includes("設計") || subCat.includes("動畫")) groupKey = "creative";
                else if (subCat.includes("研究")) groupKey = "theoretical";
                else continue;
            }

            if (!globalProcessedData[year]) {
                globalProcessedData[year] = {
                    creative: {}, theoretical: {},
                    creativeTotal: 0, theoreticalTotal: 0,
                    papers: { creative: [], theoretical: [] }
                };
            }

            // 累加資料
            globalProcessedData[year][groupKey][subCat] = (globalProcessedData[year][groupKey][subCat] || 0) + 1;
            globalProcessedData[year][`${groupKey}Total`]++;
            // 同時儲存論文標題與對應的子分類，以便渲染膠囊標籤
            if (title) globalProcessedData[year].papers[groupKey].push({ title, subCat });

            globalProcessedData.all[groupKey][subCat] = (globalProcessedData.all[groupKey][subCat] || 0) + 1;
            globalProcessedData.all[`${groupKey}Total`]++;
            // 同時儲存論文標題與對應的子分類，以便渲染膠囊標籤
            if (title) globalProcessedData.all.papers[groupKey].push({ title, subCat });
        }

        renderDashboard('all');

    } catch (error) {
        console.error("讀取或處理 CSV 檔案時發生錯誤:", error);
    }
}

// 繪製 SVG 甜甜圈圖 (帶有間隙與細黑外框的現代極簡風格)
function drawDonutChart(containerId, dataObj, totalCount) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalCount === 0) { container.innerHTML = ""; return; }

    const radius = 35; 
    const strokeWidth = 4.5; // 色彩層線寬
    const outlineThickness = 0.5; // 黑框凸出的厚度 (1.5代表邊緣約有 0.75px 的黑線)
    const circumference = 2 * Math.PI * radius; 
    const gap = 3; // 稍微加大間隙，預留空間給黑框，才不會互相沾黏
    
    let accumulatedPercent = 0; 

    let svgHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="transform: rotate(-90deg); width: 100%; height: 100%; overflow: visible;">`;

    for (const [subCat, count] of Object.entries(dataObj)) {
        const color = getSubCategoryColor(subCat);
        const percentage = count / totalCount;
        const strokeLength = percentage * circumference;
        const rotateAngle = accumulatedPercent * 360;

        const visibleLength = Math.max(0, strokeLength - gap);

        // 如果該項目的長度扣掉間隙後大於 0 才進行繪製
        if (visibleLength > 0) {
            
            // 1. 計算外框的長度與偏移角度，確保它剛好包覆色彩層的頭尾
            const outlineLength = visibleLength + outlineThickness;
            const outlineOffsetAngle = ((outlineThickness / 2) / circumference) * 360;
            const outlineRotateAngle = rotateAngle - outlineOffsetAngle;

            // 2. 繪製底層的黑色外框
            svgHtml += `
                <circle cx="50" cy="50" r="${radius}"
                        fill="none"
                        stroke="#000000"
                        stroke-width="${strokeWidth + outlineThickness}"
                        stroke-dasharray="${outlineLength} ${circumference}"
                        style="transform: rotate(${outlineRotateAngle}deg); transform-origin: 50px 50px; transition: stroke-dasharray 0.5s ease;" />
            `;

            // 3. 疊加上層的色彩線條
            svgHtml += `
                <circle cx="50" cy="50" r="${radius}"
                        fill="none"
                        stroke="${color}"
                        stroke-width="${strokeWidth}"
                        stroke-dasharray="${visibleLength} ${circumference}"
                        style="transform: rotate(${rotateAngle}deg); transform-origin: 50px 50px; transition: stroke-dasharray 0.5s ease;" />
            `;
        }
        accumulatedPercent += percentage;
    }
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

// 渲染圖例 (僅保留 %)
function renderLegend(containerId, dataObj, totalCount) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalCount === 0) {
        container.innerHTML = `<li class="legend-item" style="color: #888;">尚無統計資料</li>`;
        return;
    }

    const sortedData = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);

    container.innerHTML = sortedData
        .map(([subCat, count]) => {
            const color = getSubCategoryColor(subCat);
            const pct = ((count / totalCount) * 100).toFixed(1);
            return `
                <li class="legend-item">
                    <div class="color-dot" style="background-color: ${color};"></div>
                    <span>${subCat} ${pct}%</span>
                </li>
            `;
        }).join('');
}

// 渲染下方論文清單 (膠囊標籤版)
function renderPaperList(containerId, paperList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (paperList.length === 0) {
        container.innerHTML = "<div style='color:#888; width: 100%; font-size: 0.9cqw;'>暫無論文資料</div>";
        return;
    }
    
    container.innerHTML = paperList.map((paper) => {
        const color = getSubCategoryColor(paper.subCat);
        return `
            <div class="paper-chip">
                <div class="paper-chip-dot" style="background-color: ${color};"></div>
                <span class="paper-chip-text">${paper.title}</span>
            </div>
        `;
    }).join('');
}

// 主控渲染控制
function renderDashboard(year) {
    const data = globalProcessedData[year] || globalProcessedData['all'];

    drawDonutChart('creative-chart', data.creative, data.creativeTotal);
    drawDonutChart('theoretical-chart', data.theoretical, data.theoreticalTotal);
    renderLegend('creative-legend', data.creative, data.creativeTotal);
    renderLegend('theoretical-legend', data.theoretical, data.theoreticalTotal);
    renderPaperList('creative-papers', data.papers.creative);
    renderPaperList('theoretical-papers', data.papers.theoretical);

    // 取得各個區塊元素
    const dashContainer = document.querySelector('.dashboard-container');
    const overviewContainer = document.getElementById('overview-container');
    const posterContainer = document.getElementById('left-visual-content'); // 左側海報區塊
    const posterImg = document.getElementById('year-poster'); // 海報圖片本身
    const normalElements = document.querySelectorAll('.title-group, .pie-chart, .legend-list, .list-title, .paper-box');

    if (year === 'all') {
        // 【十年總覽模式】
        if (dashContainer) dashContainer.style.backgroundImage = "url('../img/background_4.jpg')";
        
        // 隱藏一般年份的圓餅圖、論文清單，以及左側海報區
        normalElements.forEach(el => el.style.display = 'none');
        if (posterContainer) posterContainer.style.display = 'none'; 
        
        // 顯示長條圖區域
        if (overviewContainer) overviewContainer.style.display = 'block';
    } else {
        // 【單一年份模式】
        if (dashContainer) dashContainer.style.backgroundImage = "url('../img/background_3.jpg')";
        
        // 恢復一般年份的圓餅圖、論文清單，以及左側海報區
        normalElements.forEach(el => el.style.display = '');
        if (posterContainer) posterContainer.style.display = 'flex'; 
        
        // 更新海報圖片
        if (posterImg) posterImg.src = `img/poster_${year}.jpg`; 
        
        // 隱藏長條圖區域
        if (overviewContainer) overviewContainer.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 導覽列按鈕切換邏輯
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            navButtons.forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            const targetYear = event.target.getAttribute('data-year');
            renderDashboard(targetYear);
        });
    });

    // 長條圖區域的「創作組 / 理論組」切換邏輯
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    const barChartImg = document.getElementById('bar-chart-img');

    if (toggleBtns.length > 0 && barChartImg) {
        toggleBtns.forEach(button => {
            button.addEventListener('click', (event) => {
                // 移除兩個按鈕的 active 狀態
                toggleBtns.forEach(btn => btn.classList.remove('active'));
                // 點擊的按鈕加上 active
                event.target.classList.add('active');

                // 判斷按下的群組並切換對應的長條圖圖片
                const group = event.target.getAttribute('data-group');
                if (group === 'creative') {
                    barChartImg.src = 'img/創作組_長條圖.png';
                } else if (group === 'theoretical') {
                    barChartImg.src = 'img/理論組_長條圖.png';
                }
            });
        });
    }

    loadAndParseCSV();
});