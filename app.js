let db = {
    userProfile: { nombre: "", cedula: "", password: "", saldoInicial: 0, configurado: false },
    ingresos: [],
    tarjetas: [],
    gastos: [],
    pagosRealizados: [],
    logs: [],
    lastProcessedMonth: ""
};

function generateSafeId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
}

const BANK_LOGOS = {
    "Banco Pichincha": `<svg class="bank-icon-svg" viewBox="0 0 24 24" fill="#facc15"><rect width="24" height="24" rx="5" fill="#1e3a8a"/><path d="M7 7h10v3H7zM7 12h10v5H7z"/></svg>`,
    "Banco Guayaquil": `<svg class="bank-icon-svg" viewBox="0 0 24 24" fill="#ec4899"><rect width="24" height="24" rx="5" fill="#831843"/><circle cx="12" cy="12" r="5"/></svg>`,
    "Produbanco": `<svg class="bank-icon-svg" viewBox="0 0 24 24" fill="#10b981"><rect width="24" height="24" rx="5" fill="#064e3b"/><rect x="7" y="7" width="10" height="10" rx="2"/></svg>`,
    "Diners Club": `<svg class="bank-icon-svg" viewBox="0 0 24 24" fill="#ffffff"><rect width="24" height="24" rx="5" fill="#1d4ed8"/><circle cx="9" cy="12" r="3.5"/><circle cx="15" cy="12" r="3.5"/></svg>`,
    "Otro Banco": `<svg class="bank-icon-svg" viewBox="0 0 24 24" fill="#a855f7"><rect width="24" height="24" rx="5" fill="#581c87"/><path d="M12 5v14M5 12h14"/></svg>`
};

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

document.addEventListener("DOMContentLoaded", () => {
    try {
        const saved = localStorage.getItem("finanzas_db");
        if (saved) {
            db = JSON.parse(saved);
            if (!db.pagosRealizados) db.pagosRealizados = [];
            if (!db.logs) db.logs = [];
            if (!db.userProfile) db.userProfile = { nombre: "", cedula: "", password: "", saldoInicial: 0, configurado: false };
        }
    } catch (e) {
        console.error("Error leyendo localStorage:", e);
        localStorage.removeItem("finanzas_db");
    }

    const wizard = document.getElementById("wizardScreen");
    const login = document.getElementById("loginScreen");
    const appLayout = document.getElementById("appLayout");

    if (!db.userProfile || !db.userProfile.configurado) {
        if (wizard) wizard.style.display = "flex";
        if (login) login.style.display = "none";
        if (appLayout) appLayout.classList.remove("active");
    } else {
        if (login) login.style.display = "flex";
        if (wizard) wizard.style.display = "none";
        if (appLayout) appLayout.classList.remove("active");
        checkAndGenerateRecurringExpenses();
    }
    
    const expFecha = document.getElementById("expFecha");
    const incFecha = document.getElementById("incFecha");
    if (expFecha) expFecha.value = new Date().toISOString().split("T")[0];
    if (incFecha) incFecha.value = new Date().toISOString().split("T")[0];

    handleNarrativeFlowChange();

    // Listener global para cerrar el sidebar en móviles al hacer clic fuera de él
    document.addEventListener("click", (e) => {
        const sidebar = document.getElementById("sidebar");
        const mobileToggleBtn = document.querySelector(".mobile-toggle-btn");
        if (sidebar && sidebar.classList.contains("open")) {
            if (!sidebar.contains(e.target) && mobileToggleBtn && !mobileToggleBtn.contains(e.target)) {
                sidebar.classList.remove("open");
            }
        }
    });
});

function saveState() {
    try { localStorage.setItem("finanzas_db", JSON.stringify(db)); } catch (e) {}
}

function addAuditLog(modulo, descripcion) {
    const timestamp = new Date().toLocaleString("es-EC", { dateStyle: "short", timeStyle: "medium" });
    if (!db.logs) db.logs = [];
    db.logs.unshift({ timestamp, modulo, descripcion });
}

function togglePrivacyMode() {
    document.body.classList.toggle("privacy-mode");
    const btn = document.getElementById("btnPrivacyToggle");
    if (btn) btn.innerText = document.body.classList.contains("privacy-mode") ? "🙈 Mostrar Saldos" : "👁️ Ocultar Saldos";
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.toggle("open");
}

function openQuickExpenseModal() {
    switchTab('gastos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openAddCardModal() {
    document.getElementById("crdEditId").value = "";
    document.getElementById("crdAlias").value = "";
    document.getElementById("crdCupo").value = "";
    document.getElementById("crdCorte").value = "";
    document.getElementById("crdPago").value = "";
    document.getElementById("cardFormTitleModal").innerText = "Registrar Tarjeta";
    document.getElementById("modalCardForm").classList.add("active");
}

function closeCardFormModal() { document.getElementById("modalCardForm").classList.remove("active"); }
function closeCardDetailsModal() { document.getElementById("modalCardDetails").classList.remove("active"); }

function openCardConsumptionsModal(cardId) {
    const card = db.tarjetas.find(c => c.id == cardId);
    if (!card) return;
    document.getElementById("modalCardTitle").innerText = `📋 Consumos: ${card.alias}`;
    const blocked = calculateCardBlockedDebt(cardId);
    document.getElementById("modalCardSummary").innerHTML = `Cupo Total: $${(card.cupoTotal||1000).toFixed(2)} | Bloqueado: $${blocked.toFixed(2)}`;
    
    const tbody = document.getElementById("tblCardConsumptionsBody");
    tbody.innerHTML = "";
    const list = db.gastos.filter(g => g.metodoPago === "card" && g.tarjetaId == cardId);
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:1rem;">Sin consumos.</td></tr>`;
    } else {
        list.forEach(g => {
            tbody.innerHTML += `<tr><td>${g.detalle}</td><td style="color:var(--accent-rose)">$${g.montoTotal.toFixed(2)}</td><td>${g.modoCredito}</td><td>${g.cuotasTotales}c</td><td>${g.fechaConsumo}</td><td><button onclick="deleteExpenseFromCard('${g.id}','${cardId}')" class="btn-danger" style="padding:0.2rem 0.4rem; font-size:0.7rem;">Eliminar</button></td></tr>`;
        });
    }
    document.getElementById("modalCardDetails").classList.add("active");
}

function deleteExpenseFromCard(expenseId, cardId) {
    if (confirm("¿Eliminar consumo?")) {
        db.gastos = db.gastos.filter(i => i.id != expenseId);
        saveState();
        renderAll();
        openCardConsumptionsModal(cardId);
    }
}

function getDueDateStatus(dateStr) {
    if (!dateStr) return { text: `📅 Sin fecha`, isOverdue: false };
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(dateStr + "T00:00:00"); target.setHours(0,0,0,0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { text: `⚠️ Vencido hace ${Math.abs(diff)}d`, isOverdue: true };
    if (diff === 0) return { text: `🔥 ¡Vence HOY!`, isOverdue: true };
    return { text: `⏳ Quedan ${diff}d`, isOverdue: false };
}

function getCardDueDateStatus(diaMaxPago) {
    const today = new Date();
    let target = new Date(today.getFullYear(), today.getMonth(), diaMaxPago);
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (target < midnight) target = new Date(today.getFullYear(), today.getMonth() + 1, diaMaxPago);
    const diff = Math.ceil((target - midnight) / (1000 * 60 * 60 * 24));
    if (diff === 0) return { text: `🔥 ¡Vence HOY!`, isOverdue: true };
    return { text: `⏳ Quedan ${diff}d`, isOverdue: false };
}

function checkAndGenerateRecurringExpenses() {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}`;
    if (db.lastProcessedMonth !== key) {
        db.gastos.filter(g => g.recurrente === true && g.executionType === "PROGRAMMED").forEach(g => {
            const parts = g.fechaConsumo.split("-");
            const newMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const genDate = `${newMonth}-${parts[2] || '01'}`;
            if (!db.gastos.some(i => i.detalle === g.detalle && i.fechaConsumo.startsWith(newMonth))) {
                db.gastos.push({
                    id: generateSafeId(), detalle: g.detalle, montoTotal: g.montoTotal,
                    fechaConsumo: genDate, executionType: "PROGRAMMED", recurrente: true,
                    metodoPago: g.metodoPago, tarjetaId: g.tarjetaId, modoCredito: g.modoCredito,
                    cuotasTotales: g.cuotasTotales, mesesGracia: g.mesesGracia || 0, pagado: false
                });
            }
        });
        db.lastProcessedMonth = key;
        saveState();
    }
}

function handleWizardStep(e) {
    if (e) e.preventDefault();
    db.userProfile = {
        nombre: document.getElementById("wNombre").value,
        cedula: document.getElementById("wCedula").value,
        password: document.getElementById("wPassword").value,
        saldoInicial: parseFloat(document.getElementById("wSaldo").value) || 0,
        configurado: true
    };
    addAuditLog("Perfil", `Perfil configurado: ${db.userProfile.nombre}`);
    checkAndGenerateRecurringExpenses();
    saveState();
    document.getElementById("wizardScreen").style.display = "none";
    document.getElementById("appLayout").classList.add("active");
    renderAll();
    initSimulatorDefaults();
}

function handleLogin(e) {
    if (e) e.preventDefault();
    if (document.getElementById("loginCedula").value === db.userProfile.cedula && document.getElementById("loginPassword").value === db.userProfile.password) {
        addAuditLog("Perfil", "Inicio de sesión exitoso");
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("appLayout").classList.add("active");
        renderAll();
        initSimulatorDefaults();
    } else { alert("Credenciales incorrectas."); }
}

function logout() { location.reload(); }
function resetFactoryData() { if (confirm("¿Reiniciar sistema?")) { localStorage.removeItem("finanzas_db"); location.reload(); } }

function switchTab(tabId, btn) {
    document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const sec = document.getElementById(`sec-${tabId}`);
    if (sec) sec.classList.add("active");
    if (btn) btn.classList.add("active");
    if (tabId === 'simulador') initSimulatorDefaults();
    document.getElementById("sidebar").classList.remove("open");
}

function handleNarrativeFlowChange() {
    const type = document.getElementById("expExecutionType").value;
    const boxProg = document.getElementById("boxProgrammedOptions");
    const boxCard = document.getElementById("boxCardSpecificOptions");
    if (type === "IMMEDIATE") {
        if (boxProg) boxProg.style.display = "none";
        if (boxCard) boxCard.style.display = "none";
    } else {
        if (boxProg) boxProg.style.display = "grid";
        const metodo = document.getElementById("expMetodo").value;
        if (metodo === "card") {
            if (boxCard) boxCard.style.display = "grid";
            populateCardSelect();
        } else { if (boxCard) boxCard.style.display = "none"; }
    }
}

function checkCustomExpenseCategory() {
    document.getElementById("boxCustomCategory").style.display = document.getElementById("expCategorySelect").value === "OTRO" ? "flex" : "none";
}
function toggleDiferidoOptions() {
    const isDif = document.getElementById("expModoCredito").value === "diferido";
    document.querySelectorAll(".group-diferido").forEach(el => el.style.display = isDif ? "flex" : "none");
}
function populateCardSelect() {
    const sel = document.getElementById("expTarjetaSelect");
    if (sel && db.tarjetas) sel.innerHTML = db.tarjetas.map(c => `<option value="${c.id}">${c.alias} (Día ${c.diaMaxPago})</option>`).join('');
}

function initSimulatorDefaults() {
    const hoy = new Date();
    const cur = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    let incTot = 0; db.ingresos?.forEach(i => { if (i.fechaAcreditacion?.startsWith(cur)) incTot += i.monto; });
    if (incTot === 0) incTot = 1200;
    let gasTot = 0; db.gastos?.forEach(g => { if (g.fechaConsumo?.startsWith(cur)) gasTot += g.montoTotal; });
    if (gasTot === 0) gasTot = 750;
    
    // Calcular líquido actual real (solo ingresos pasados/hoy)
    const todayStr = new Date().toISOString().split("T")[0];
    const todayDate = new Date(todayStr + "T00:00:00");
    let incAcreditados = 0;
    db.ingresos?.forEach(i => {
        if (i.fechaAcreditacion && new Date(i.fechaAcreditacion + "T00:00:00") <= todayDate) {
            incAcreditados += i.monto;
        }
    });
    const paid = db.pagosRealizados?.reduce((s, p) => s + p.montoPagado, 0) || 0;
    const disp = Math.max(0, (db.userProfile.saldoInicial + incAcreditados) - paid);

    if (document.getElementById("simSaldoBase")) document.getElementById("simSaldoBase").value = disp.toFixed(2);
    if (document.getElementById("simIngresoMensual")) document.getElementById("simIngresoMensual").value = incTot.toFixed(2);
    if (document.getElementById("simCostoVida")) document.getElementById("simCostoVida").value = gasTot.toFixed(2);
    runFinancialSimulator();
}

function runFinancialSimulator(e) {
    if (e) e.preventDefault();
    const ini = parseFloat(document.getElementById("simSaldoBase")?.value) || 750;
    const inc = parseFloat(document.getElementById("simIngresoMensual")?.value) || 1500;
    const cos = parseFloat(document.getElementById("simCostoVida")?.value) || 900;
    const cuo = parseFloat(document.getElementById("simDeudaCuota")?.value) || 135;
    const pla = parseInt(document.getElementById("simDeudaPlazo")?.value) || 15;
    
    const tbody = document.getElementById("tblSimuladorBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    let acum = ini;
    const now = new Date();
    for (let i = 1; i <= Math.max(pla, 12); i++) {
        let m = (now.getMonth() + i - 1) % 12;
        let y = now.getFullYear() + Math.floor((now.getMonth() + i - 1) / 12);
        let cuotaMes = i <= pla ? cuo : 0;
        let neto = inc - (cos + cuotaMes);
        acum += neto;
        tbody.innerHTML += `<tr><td style="font-weight:bold">${MONTH_NAMES[m]} ${y}</td><td style="color:var(--accent-emerald)">+$${inc.toFixed(2)}</td><td style="color:var(--text-secondary)">-$${cos.toFixed(2)}</td><td>${cuotaMes > 0 ? '-$' + cuotaMes.toFixed(2) : '$0.00'}</td><td style="font-weight:bold; color:${neto>=0?'var(--accent-emerald)':'var(--accent-rose)'}">${neto>=0?'+':''}$${neto.toFixed(2)}</td><td style="font-weight:900; color:${acum>=0?'var(--accent-emerald)':'var(--accent-rose)'}">$${acum.toFixed(2)}</td></tr>`;
    }
}

function saveIncomeForm(e) {
    if (e) e.preventDefault();
    const id = document.getElementById("incEditId").value;
    const cat = document.getElementById("incCat").value;
    const monto = parseFloat(document.getElementById("incMonto").value) || 0;
    const fecha = document.getElementById("incFecha").value;
    const rec = document.getElementById("incRecurrente").value === "true";

    if (id) {
        const idx = db.ingresos.findIndex(i => i.id == id);
        if (idx !== -1) { db.ingresos[idx] = { ...db.ingresos[idx], categoria: cat, monto, fechaAcreditacion: fecha, recurrente: rec }; }
    } else {
        db.ingresos.push({ id: generateSafeId(), categoria: cat, monto, fechaAcreditacion: fecha, recurrente: rec, registradoEl: new Date().toLocaleString() });
    }
    cancelIncomeEdit(); saveState(); renderAll();
}

function editIncome(id) {
    const inc = db.ingresos.find(i => i.id == id);
    if (inc) {
        document.getElementById("incEditId").value = inc.id;
        document.getElementById("incCat").value = inc.categoria;
        document.getElementById("incMonto").value = inc.monto;
        document.getElementById("incFecha").value = inc.fechaAcreditacion;
        document.getElementById("incRecurrente").value = inc.recurrente ? "true" : "false";
        document.getElementById("incFormTitle").innerText = "Editar Ingreso";
        document.getElementById("btnSaveIncome").innerText = "Actualizar";
        document.getElementById("btnCancelEditIncome").style.display = "block";
    }
}

function cancelIncomeEdit() {
    document.getElementById("incEditId").value = "";
    document.getElementById("incMonto").value = "";
    document.getElementById("incFormTitle").innerText = "Registrar Ingreso";
    document.getElementById("btnSaveIncome").innerText = "Guardar Ingreso";
    document.getElementById("btnCancelEditIncome").style.display = "none";
}

function deleteIncome(id) {
    if (confirm("¿Eliminar ingreso?")) { db.ingresos = db.ingresos.filter(i => i.id != id); saveState(); renderAll(); }
}

function saveExpenseForm(e) {
    if (e) e.preventDefault();
    const id = document.getElementById("expEditId").value;
    const exec = document.getElementById("expExecutionType").value;
    const catSel = document.getElementById("expCategorySelect").value;
    const cat = catSel === "OTRO" ? (document.getElementById("expCustomCategory").value || "Gasto") : catSel;
    const monto = parseFloat(document.getElementById("expMonto").value) || 0;
    const fecha = document.getElementById("expFecha").value;

    if (id) {
        const idx = db.gastos.findIndex(g => g.id == id);
        if (idx !== -1) { db.gastos[idx].detalle = cat; db.gastos[idx].montoTotal = monto; db.gastos[idx].fechaConsumo = fecha; }
    } else {
        if (exec === "IMMEDIATE") {
            const newId = generateSafeId();
            db.gastos.push({ id: newId, detalle: cat, montoTotal: monto, fechaConsumo: fecha, executionType: "IMMEDIATE", metodoPago: "cash", pagado: true });
            db.pagosRealizados.push({ id: generateSafeId(), itemId: newId, tipoItem: "gasto_inmediato", nombreItem: `${cat} (Contado)`, montoPagado: monto, fechaPago: fecha, registradoEl: new Date().toLocaleString() });
        } else {
            const metodo = document.getElementById("expMetodo").value;
            const modo = metodo === "card" ? document.getElementById("expModoCredito").value : "corriente";
            db.gastos.push({
                id: generateSafeId(), detalle: cat, montoTotal: monto, fechaConsumo: fecha,
                executionType: "PROGRAMMED", recurrente: document.getElementById("expRecurrente").value === "true",
                metodoPago: metodo, tarjetaId: metodo === "card" ? document.getElementById("expTarjetaSelect").value : null,
                modoCredito: modo, cuotasTotales: metodo === "card" && modo === "diferido" ? parseInt(document.getElementById("expCuotas").value) : 1,
                mesesGracia: metodo === "card" && modo === "diferido" ? parseInt(document.getElementById("expMesesGracia").value) : 0, pagado: false
            });
        }
    }
    cancelExpenseEdit(); saveState(); renderAll();
}

function editExpense(id) {
    const g = db.gastos.find(item => item.id == id);
    if (g) {
        document.getElementById("expEditId").value = g.id;
        document.getElementById("expMonto").value = g.montoTotal;
        document.getElementById("expFecha").value = g.fechaConsumo;
        document.getElementById("expFormTitle").innerText = "Editar Compromiso";
        document.getElementById("btnSaveExpense").innerText = "Actualizar";
        document.getElementById("btnCancelEditExpense").style.display = "block";
    }
}

function cancelExpenseEdit() {
    document.getElementById("expEditId").value = "";
    document.getElementById("expMonto").value = "";
    document.getElementById("expFormTitle").innerText = "Registrar / Editar Consumo o Compromiso";
    document.getElementById("btnSaveExpense").innerText = "Guardar Registro";
    document.getElementById("btnCancelEditExpense").style.display = "none";
}

function deleteExpense(id) {
    if (confirm("¿Eliminar compromiso?")) { db.gastos = db.gastos.filter(i => i.id != id); saveState(); renderAll(); }
}

function saveCardForm(e) {
    if (e) e.preventDefault();
    const id = document.getElementById("crdEditId").value;
    const alias = document.getElementById("crdAlias").value;
    const banco = document.getElementById("crdBanco").value;
    const cupo = parseFloat(document.getElementById("crdCupo").value) || 0;
    const corte = parseInt(document.getElementById("crdCorte").value) || 12;
    const pago = parseInt(document.getElementById("crdPago").value) || 28;

    if (id) {
        const idx = db.tarjetas.findIndex(c => c.id == id);
        if (idx !== -1) db.tarjetas[idx] = { ...db.tarjetas[idx], alias, banco, cupoTotal: cupo, diaCorte: corte, diaMaxPago: pago };
    } else {
        db.tarjetas.push({ id: generateSafeId(), alias, banco, cupoTotal: cupo, diaCorte: corte, diaMaxPago: pago });
    }
    closeCardFormModal(); saveState(); renderAll();
}

function editCard(id) {
    const c = db.tarjetas.find(item => item.id == id);
    if (c) {
        document.getElementById("crdEditId").value = c.id;
        document.getElementById("crdAlias").value = c.alias;
        document.getElementById("crdBanco").value = c.banco;
        document.getElementById("crdCupo").value = c.cupoTotal || 1000;
        document.getElementById("crdCorte").value = c.diaCorte;
        document.getElementById("crdPago").value = c.diaMaxPago;
        document.getElementById("cardFormTitleModal").innerText = "Editar Tarjeta";
        document.getElementById("modalCardForm").classList.add("active");
    }
}

function deleteCard(id) {
    if (confirm("¿Eliminar tarjeta?")) { db.tarjetas = db.tarjetas.filter(c => c.id != id); saveState(); renderAll(); }
}

function calculateCardBlockedDebt(cardId) {
    let blocked = 0;
    db.gastos?.filter(g => g.metodoPago === "card" && g.tarjetaId == cardId).forEach(g => { blocked += g.montoTotal; });
    const paid = db.pagosRealizados?.filter(p => p.tipoItem === "card" && p.itemId == cardId).reduce((s, p) => s + p.montoPagado, 0) || 0;
    return Math.max(0, blocked - paid);
}

function calculateCardMonthlyQuota(cardId) {
    let quota = 0; const now = new Date();
    db.gastos?.filter(g => g.metodoPago === "card" && g.tarjetaId == cardId).forEach(g => {
        if (g.fechaConsumo) {
            const cons = new Date(g.fechaConsumo + "T00:00:00");
            const start = new Date(cons); start.setMonth(start.getMonth() + (g.mesesGracia || 0));
            if (now >= start) quota += (g.montoTotal / (g.cuotasTotales || 1));
        }
    });
    const paid = db.pagosRealizados?.filter(p => p.tipoItem === "card" && p.itemId == cardId).reduce((s, p) => s + p.montoPagado, 0) || 0;
    return Math.max(0, quota - paid);
}

function openPayModal(itemId, type) {
    document.getElementById("modalPayItemId").value = itemId;
    document.getElementById("modalPayItemType").value = type;
    document.getElementById("modalPayMoraInput").value = "0.00";
    document.getElementById("modalPayDateInput").value = new Date().toISOString().split("T")[0];

    if (type === "card") {
        const c = db.tarjetas.find(item => item.id == itemId);
        const debt = calculateCardMonthlyQuota(itemId);
        document.getElementById("modalPayTitle").innerText = `Pagar: ${c.alias}`;
        document.getElementById("modalPaySubtitle").innerText = `Vencimiento Día ${c.diaMaxPago}`;
        document.getElementById("modalPayDebtValue").value = `$${debt.toFixed(2)}`;
        document.getElementById("modalPayAmountInput").value = debt.toFixed(2);
    } else {
        const g = db.gastos.find(item => item.id == itemId);
        document.getElementById("modalPayTitle").innerText = `Pagar: ${g.detalle}`;
        document.getElementById("modalPaySubtitle").innerText = `Vencimiento: ${g.fechaConsumo}`;
        document.getElementById("modalPayDebtValue").value = `$${g.montoTotal.toFixed(2)}`;
        document.getElementById("modalPayAmountInput").value = g.montoTotal.toFixed(2);
    }
    document.getElementById("modalPayCard").classList.add("active");
}

function closePayModal() { document.getElementById("modalPayCard").classList.remove("active"); }

function submitModalPayment(e) {
    if (e) e.preventDefault();
    const itemId = document.getElementById("modalPayItemId").value;
    const type = document.getElementById("modalPayItemType").value;
    const amt = parseFloat(document.getElementById("modalPayAmountInput").value) || 0;
    const mora = parseFloat(document.getElementById("modalPayMoraInput").value) || 0;
    const date = document.getElementById("modalPayDateInput").value;
    const total = amt + mora;

    if (type === "card") {
        const c = db.tarjetas.find(item => item.id == itemId);
        db.pagosRealizados.push({ id: generateSafeId(), itemId, tipoItem: "card", nombreItem: `${c.alias}`, montoPagado: total, fechaPago: date, registradoEl: new Date().toLocaleString() });
        addAuditLog("Pagos", `Pago a Tarjeta ${c.alias}: $${total.toFixed(2)}`);
    } else {
        const g = db.gastos.find(item => item.id == itemId);
        if (g) g.pagado = true;
        db.pagosRealizados.push({ id: generateSafeId(), itemId, tipoItem: "gasto", nombreItem: `${g.detalle}`, montoPagado: total, fechaPago: date, registradoEl: new Date().toLocaleString() });
        addAuditLog("Pagos", `Pago compromiso ${g.detalle}: $${total.toFixed(2)}`);
    }
    saveState(); closePayModal(); renderAll();
}

function deletePayment(id) {
    if (confirm("¿Eliminar registro de pago?")) { db.pagosRealizados = db.pagosRealizados.filter(p => p.id != id); saveState(); renderAll(); }
}

function exportJSON() {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    a.download = 'data.json'; a.click();
}

function exportCSV() {
    let csv = "Tipo,Detalle,Monto,Fecha,Estado\n";
    db.ingresos?.forEach(i => { csv += `Ingreso,${i.categoria},${i.monto},${i.fechaAcreditacion},Acreditado\n`; });
    db.gastos?.forEach(g => { csv += `Gasto,${g.detalle},${g.montoTotal},${g.fechaConsumo},${g.pagado?'Pagado':'Pendiente'}\n`; });
    const a = document.createElement('a');
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = 'reporte_finanzas.csv'; a.click();
}

function renderAll() {
    document.getElementById("userNameDisplay").innerText = db.userProfile.nombre || "FinanzasPro";
    const hoy = new Date();
    const cur = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = hoy.toISOString().split("T")[0];
    const todayDate = new Date(todayStr + "T00:00:00");

    let ingresosMes = 0;
    let ingresosAcreditadosActuales = 0;

    const tblIng = document.getElementById("tblIngresosBody");
    tblIng.innerHTML = "";
    db.ingresos?.forEach(i => {
        if (i.fechaAcreditacion?.startsWith(cur)) ingresosMes += i.monto;
        if (i.fechaAcreditacion && new Date(i.fechaAcreditacion + "T00:00:00") <= todayDate) {
            ingresosAcreditadosActuales += i.monto;
        }
        tblIng.innerHTML += `<tr><td><b>${i.categoria}</b></td><td style="color:var(--accent-emerald)">+$${i.monto.toFixed(2)}</td><td>${i.recurrente?'Recurrente':'Puntual'}</td><td>${i.fechaAcreditacion}</td><td>${i.registradoEl||''}</td><td><button onclick="editIncome('${i.id}')" class="btn-secondary">Editar</button> <button onclick="deleteIncome('${i.id}')" class="btn-danger">Eliminar</button></td></tr>`;
    });

    const totalPagado = db.pagosRealizados?.reduce((s, p) => s + p.montoPagado, 0) || 0;
    
    // El saldo líquido actual solo toma el saldo inicial + ingresos cuya fecha ya pasó o es hoy, menos lo pagado.
    const saldoDisp = Math.max(0, (db.userProfile.saldoInicial + ingresosAcreditadosActuales) - totalPagado);

    const cardsContainer = document.getElementById("cardsListContainer");
    cardsContainer.innerHTML = "";
    let totalBloqueada = 0;
    if (!db.tarjetas || db.tarjetas.length === 0) {
        cardsContainer.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-secondary);">No hay tarjetas registradas.</div>`;
    } else {
        db.tarjetas.forEach(c => {
            const blocked = calculateCardBlockedDebt(c.id);
            totalBloqueada += blocked;
            const cupoTot = c.cupoTotal || 1000;
            const dispCupo = Math.max(0, cupoTot - blocked);
            const uso = Math.min(100, (blocked / cupoTot) * 100);
            cardsContainer.innerHTML += `
                <div class="credit-card-modern">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div class="bank-badge">${BANK_LOGOS[c.banco] || BANK_LOGOS["Otro Banco"]} <span>${c.banco}</span></div>
                        <span style="font-size:0.65rem; color:var(--text-secondary);">DÍA ${c.diaMaxPago}</span>
                    </div>
                    <div class="card-emv-chip"></div>
                    <div><div style="font-weight:800">${c.alias}</div><div style="font-size:0.72rem; color:var(--text-secondary);">Cupo: $${cupoTot.toFixed(2)}</div></div>
                    <div style="display:flex; justify-content:space-between; font-size:0.68rem;"><span>Uso: <strong style="color:var(--accent-rose)">$${blocked.toFixed(2)}</strong></span><span>Disp: <strong style="color:var(--accent-emerald)">$${dispCupo.toFixed(2)}</strong></span></div>
                    <div style="display:flex; justify-content:flex-end; gap:0.25rem;">
                        <button onclick="openCardConsumptionsModal('${c.id}')" class="btn-secondary" style="font-size:0.65rem;">Ver</button>
                        <button onclick="openPayModal('${c.id}','card')" class="btn-primary" style="margin-top:0; padding:0.3rem 0.5rem; font-size:0.65rem;">Pagar</button>
                        <button onclick="editCard('${c.id}')" class="btn-secondary" style="font-size:0.65rem;">✏️</button>
                        <button onclick="deleteCard('${c.id}')" class="btn-danger" style="font-size:0.65rem;">🗑️</button>
                    </div>
                </div>
            `;
        });
    }

    let q1Meta = 0, q2Meta = 0, incQ1 = 0, incQ2 = 0;
    db.ingresos?.forEach(i => {
        if (i.fechaAcreditacion?.startsWith(cur)) {
            const d = parseInt(i.fechaAcreditacion.split("-")[2] || "1");
            if (d >= 15) incQ1 += i.monto; else incQ2 += i.monto;
        }
    });

    const bC1 = document.getElementById("blockCardsQ1"), bE1 = document.getElementById("blockExpensesQ1");
    const bC2 = document.getElementById("blockCardsQ2"), bE2 = document.getElementById("blockExpensesQ2");
    if (bC1) {
        bC1.innerHTML = ""; bE1.innerHTML = ""; bC2.innerHTML = ""; bE2.innerHTML = "";
        db.tarjetas?.forEach(c => {
            const q = calculateCardMonthlyQuota(c.id);
            const esQ1 = c.diaMaxPago >= 15;
            if (esQ1) q1Meta += q; else q2Meta += q;
            const html = `<div class="payment-item-card"><div style="display:flex; justify-content:space-between;"><b>${c.alias}</b><span class="payment-item-badge ${esQ1?'badge-amber':'badge-rose'}">Día ${c.diaMaxPago}</span></div><div style="display:flex; justify-content:space-between; align-items:center;"><strong style="color:var(--accent-rose)">$${q.toFixed(2)}</strong><button onclick="openPayModal('${c.id}','card')" class="btn-primary" style="margin-top:0; padding:0.3rem 0.6rem; font-size:0.7rem; width:auto;">Pagar</button></div></div>`;
            if (esQ1) bC1.innerHTML += html; else bC2.innerHTML += html;
        });

        db.gastos?.filter(g => g.executionType === "PROGRAMMED" && g.metodoPago === "cash" && g.fechaConsumo?.startsWith(cur)).forEach(g => {
            const d = parseInt(g.fechaConsumo.split("-")[2] || "1");
            const esQ1 = d >= 15;
            if (!g.pagado) { if (esQ1) q1Meta += g.montoTotal; else q2Meta += g.montoTotal; }
            const html = `<div class="payment-item-card ${g.pagado?'paid':''}"><div style="display:flex; justify-content:space-between;"><b>${g.detalle}</b><span class="payment-item-badge ${g.pagado?'badge-emerald':(esQ1?'badge-amber':'badge-rose')}">${g.pagado?'PAGADO':'Día '+d}</span></div><div style="display:flex; justify-content:space-between; align-items:center;"><strong style="color:${g.pagado?'var(--accent-emerald)':'var(--accent-rose)'}">$${g.montoTotal.toFixed(2)}</strong>${!g.pagado?`<button onclick="openPayModal('${g.id}','gasto')" class="btn-primary" style="margin-top:0; padding:0.3rem 0.6rem; font-size:0.7rem; width:auto;">Pagar</button>`:'<span>✓</span>'}</div></div>`;
            if (esQ1) bE1.innerHTML += html; else bE2.innerHTML += html;
        });
    }

    const alertGrid = document.getElementById("alertCardsGrid");
    let pendingCount = 0;
    if (alertGrid) {
        alertGrid.innerHTML = "";
        db.tarjetas?.forEach(c => {
            const q = calculateCardMonthlyQuota(c.id);
            if (q > 0) {
                pendingCount++;
                const st = getCardDueDateStatus(c.diaMaxPago);
                alertGrid.innerHTML += `<div class="alert-item-box ${st.isOverdue?'critical':'warning'}"><div style="display:flex; justify-content:space-between;"><b>💳 ${c.alias}</b><span class="payment-item-badge ${st.isOverdue?'badge-rose':'badge-amber'}">${st.text}</span></div><strong style="color:var(--accent-rose); font-size:1.2rem;">$${q.toFixed(2)}</strong><button onclick="openPayModal('${c.id}','card')" class="btn-primary" style="margin-top:0; font-size:0.75rem;">Pagar Cuota</button></div>`;
            }
        });
        db.gastos?.filter(g => g.executionType === "PROGRAMMED" && !g.pagado && g.fechaConsumo).forEach(g => {
            pendingCount++;
            const st = getDueDateStatus(g.fechaConsumo);
            alertGrid.innerHTML += `<div class="alert-item-box ${st.isOverdue?'critical':'warning'}"><div style="display:flex; justify-content:space-between;"><b>🏠 ${g.detalle}</b><span class="payment-item-badge ${st.isOverdue?'badge-rose':'badge-amber'}">${st.text}</span></div><strong style="color:var(--accent-rose); font-size:1.2rem;">$${g.montoTotal.toFixed(2)}</strong><button onclick="openPayModal('${g.id}','gasto')" class="btn-primary" style="margin-top:0; font-size:0.75rem;">Pagar Periodo</button></div>`;
        });
    }
    document.getElementById("badgePendingCount").innerText = pendingCount;

    // Lógica en cascada exacta solicitada:
    // Quincena (15-31): Saldo Líquido Actual + Ingresos Quincena - Obligaciones Quincena
    const proyQ1 = (saldoDisp + incQ1) - q1Meta;
    // Fin de mes (1-14): Remanente Quincena anterior + Ingresos Fin de Mes - Obligaciones Fin de Mes
    const proyFin = (proyQ1 + incQ2) - q2Meta;

    document.getElementById("lblSaldoBase").innerText = `$${saldoDisp.toFixed(2)}`;
    document.getElementById("lblIngresosMes").innerText = `$${ingresosMes.toFixed(2)}`;
    document.getElementById("lblDeudaTarjetas").innerText = `$${totalBloqueada.toFixed(2)}`;
    document.getElementById("lblProyQuincena").innerText = `$${proyQ1.toFixed(2)}`;
    document.getElementById("lblProyFinMes").innerText = `$${proyFin.toFixed(2)}`;

    const totalComp = q1Meta + q2Meta;
    const pct = ingresosMes > 0 ? Math.round((totalComp / ingresosMes) * 100) : 0;
    const fill = document.getElementById("healthGaugeFill");
    const lbl = document.getElementById("healthGaugeLabel");
    if (fill) {
        fill.style.width = `${Math.min(100, pct)}%`;
        fill.style.background = pct <= 40 ? "var(--accent-emerald)" : pct <= 75 ? "var(--accent-amber)" : "var(--accent-rose)";
        lbl.innerText = `${pct <= 40 ? 'Óptima' : pct <= 75 ? 'Moderada' : 'Crítica'} (${pct}%)`;
    }

    const banner = document.getElementById("proyeccionBanner");
    if (banner) {
        banner.className = proyQ1 < 0 ? "alert-banner" : "alert-banner ok";
        banner.innerHTML = proyQ1 < 0 ? `⚠️ <strong>Déficit en Quincena:</strong> Faltarán $${Math.abs(proyQ1).toFixed(2)}` : `✅ <strong>Flujo En Cascada:</strong> Remanente de quincena (15-31): $${proyQ1.toFixed(2)} | Cierre fin de mes (1-14): $${proyFin.toFixed(2)}`;
    }

    const tblGastos = document.getElementById("tblGastosBody");
    if (tblGastos) {
        tblGastos.innerHTML = "";
        db.gastos?.forEach(g => {
            tblGastos.innerHTML += `<tr><td><b>${g.detalle}</b></td><td>$${g.montoTotal.toFixed(2)}</td><td>${g.executionType==='IMMEDIATE'?'Contado':'Programado'}</td><td>${g.fechaConsumo}</td><td style="color:${g.pagado?'var(--accent-emerald)':'var(--accent-rose)'}">${g.pagado?'Pagado':'Pendiente'}</td><td><button onclick="editExpense('${g.id}')" class="btn-secondary">Editar</button> <button onclick="deleteExpense('${g.id}')" class="btn-danger">Eliminar</button></td></tr>`;
        });
    }

    const tblPay = document.getElementById("tblCardPaymentsBody");
    if (tblPay) {
        tblPay.innerHTML = "";
        db.pagosRealizados?.forEach(p => {
            tblPay.innerHTML += `<tr><td><b>${p.nombreItem}</b></td><td style="color:var(--accent-emerald)">$${p.montoPagado.toFixed(2)}</td><td>${p.fechaPago}</td><td>${p.registradoEl||''}</td><td><button onclick="deletePayment('${p.id}')" class="btn-danger">Eliminar</button></td></tr>`;
        });
    }

    const tblLogs = document.getElementById("tblAuditLogsBody");
    if (tblLogs) {
        tblLogs.innerHTML = "";
        db.logs?.forEach(l => {
            tblLogs.innerHTML += `<tr><td style="color:var(--accent-emerald); font-size:0.75rem;">${l.timestamp}</td><td><b>${l.modulo}</b></td><td style="color:var(--text-secondary)">${l.descripcion}</td></tr>`;
        });
    }
}
