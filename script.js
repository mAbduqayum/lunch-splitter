// --- SIMPLE STATE MANAGEMENT ---
const state = {
    people: [],
    items: [],
    nextPersonId: 0,
    nextItemId: 0,
    tax: 0,
    tip: 10,
    isTransposed: false
};

// --- UTILITIES ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- DOM ELEMENTS (cached on initialization) ---
const dom = {};

// --- INITIALIZATION ---
function initializeApp() {
    // Cache DOM elements once
    dom.personNameInput = document.getElementById('person-name');
    dom.addPersonBtn = document.getElementById('add-person-btn');
    dom.peopleListDiv = document.getElementById('people-list');
    dom.itemNameInput = document.getElementById('item-name');
    dom.itemPriceInput = document.getElementById('item-price');
    dom.addItemBtn = document.getElementById('add-item-btn');
    dom.itemsListDiv = document.getElementById('items-list');
    dom.taxInput = document.getElementById('tax-percent');
    dom.tipInput = document.getElementById('tip-percent');
    dom.resultsSection = document.getElementById('results-section');
    dom.clearBtn = document.getElementById('clear-btn');
    dom.exportBtn = document.getElementById('export-btn');
    dom.exportJsonBtn = document.getElementById('export-json-btn');
    dom.importJsonInput = document.getElementById('import-json-input');
    dom.shareLinkBtn = document.getElementById('share-link-btn');
    dom.transposeBtn = document.getElementById('transpose-btn');

    setupEventListeners();
    loadState();
    render();
}

function setupEventListeners() {
    // Person management
    dom.addPersonBtn.addEventListener('click', handleAddPerson);
    dom.personNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddPerson());
    dom.personNameInput.addEventListener('input', updateAddPersonButton);

    // Item management
    dom.addItemBtn.addEventListener('click', handleAddItem);
    dom.itemNameInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddItem());
    dom.itemPriceInput.addEventListener('keypress', (e) => e.key === 'Enter' && handleAddItem());
    dom.itemNameInput.addEventListener('input', updateAddItemButton);
    dom.itemPriceInput.addEventListener('input', updateAddItemButton);

    // Tax and tip (with debouncing)
    const debouncedTaxUpdate = debounce(() => {
        state.tax = parseFloat(dom.taxInput.value) || 0;
        calculateAndRenderSplit();
        saveState();
    }, 300);

    const debouncedTipUpdate = debounce(() => {
        state.tip = parseFloat(dom.tipInput.value) || 0;
        calculateAndRenderSplit();
        saveState();
    }, 300);

    dom.taxInput.addEventListener('input', debouncedTaxUpdate);
    dom.tipInput.addEventListener('input', debouncedTipUpdate);

    // Actions
    dom.transposeBtn.addEventListener('click', toggleTranspose);
    dom.shareLinkBtn.addEventListener('click', copyShareLink);
    dom.exportBtn.addEventListener('click', exportSummaryAsImage);
    dom.exportJsonBtn.addEventListener('click', exportAsJSON);
    dom.importJsonInput.addEventListener('change', importFromJSON);
    dom.clearBtn.addEventListener('click', clearState);
}

// --- UNIFIED RENDER FUNCTION ---
function render() {
    renderPeople();
    renderItems();
    calculateAndRenderSplit();
    updateAddPersonButton();
    updateAddItemButton();
}

function updateAddPersonButton() {
    dom.addPersonBtn.disabled = !dom.personNameInput.value.trim();
}

function updateAddItemButton() {
    const hasName = dom.itemNameInput.value.trim();
    const hasValidPrice = dom.itemPriceInput.value.trim() && parseFloat(dom.itemPriceInput.value) > 0;
    dom.addItemBtn.disabled = !hasName || !hasValidPrice;
}

// --- PERSON MANAGEMENT ---
function handleAddPerson() {
    const name = dom.personNameInput.value.trim();
    if (name) {
        if (state.people.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            showToast('This person has already been added.', 'error');
            return;
        }
        state.people.push({ id: state.nextPersonId++, name });
        dom.personNameInput.value = '';
        render();
        calculateAndRenderSplit();
        saveState();
    }
}

function deletePerson(personId) {
    state.people = state.people.filter(p => p.id !== personId);
    state.items = state.items.map(item => ({
        ...item,
        personQuantities: Object.fromEntries(
            Object.entries(item.personQuantities || {}).filter(([id]) => parseInt(id) !== personId)
        )
    }));
    render();
    calculateAndRenderSplit();
    saveState();
}

function editPersonName(personId) {
    const person = state.people.find(p => p.id === personId);
    if (!person) return;

    const nameSpan = document.querySelector(`[data-person-id="${personId}"]`);
    if (!nameSpan) return;

    const originalName = person.name;
    nameSpan.innerHTML = `<input type="text" value="${originalName}" class="input-field text-sm py-1 px-2" data-edit-input="${personId}">`;

    const input = nameSpan.querySelector(`[data-edit-input="${personId}"]`);
    input.focus();
    input.select();

    const savePerson = () => {
        const newName = input.value.trim();
        if (newName && newName !== originalName) {
            const personIndex = state.people.findIndex(p => p.id === personId);
            if (personIndex !== -1) {
                state.people[personIndex].name = newName;
                calculateAndRenderSplit();
                saveState();
            }
        }
        render();
    };

    input.addEventListener('keyup', (e) => e.key === 'Enter' && savePerson());
    input.addEventListener('blur', savePerson);
}

// --- ITEM MANAGEMENT ---
function handleAddItem() {
    const name = dom.itemNameInput.value.trim();
    const price = parseFloat(dom.itemPriceInput.value);

    if (name && !isNaN(price) && price > 0) {
        if (state.items.some(i => i.name.toLowerCase() === name.toLowerCase())) {
            showToast('This item has already been added.', 'error');
            return;
        }
        state.items.push({
            id: state.nextItemId++,
            name,
            price,
            personQuantities: {} // { personId: quantity }
        });
        dom.itemNameInput.value = '';
        dom.itemPriceInput.value = '';
        dom.itemNameInput.focus();
        render();
        calculateAndRenderSplit();
        saveState();
    } else {
        showToast('Please enter a valid item name and price.', 'error');
    }
}

function deleteItem(itemId) {
    state.items = state.items.filter(i => i.id !== itemId);
    render();
    calculateAndRenderSplit();
    saveState();
}

function updatePersonQuantity(itemId, personId, quantity) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    if (!item.personQuantities) item.personQuantities = {};

    const numQuantity = parseFloat(quantity) || 0;
    if (numQuantity > 0) {
        item.personQuantities[personId] = numQuantity;
    } else {
        delete item.personQuantities[personId];
    }

    renderItems();
    calculateAndRenderSplit();
    saveState();
}

function splitEvenly(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item || state.people.length === 0) return;

    item.personQuantities = {};
    state.people.forEach(person => {
        item.personQuantities[person.id] = 1; // 1 quantity each
    });

    renderItems();
    calculateAndRenderSplit();
    saveState();
}

function clearAllQuantities(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    item.personQuantities = {};
    renderItems();
    calculateAndRenderSplit();
    saveState();
}

function editItem(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return;

    const nameP = document.querySelector(`[data-item-id="${itemId}"]`);
    const priceP = document.querySelector(`[data-item-price-id="${itemId}"]`);
    if (!nameP || !priceP) return;

    const originalName = item.name;
    const originalPrice = item.price;

    nameP.innerHTML = `<input type="text" value="${originalName}" class="input-field text-sm py-1 px-2 mb-1" data-edit-name="${itemId}">`;
    priceP.innerHTML = `<input type="number" value="${originalPrice}" min="0" step="1" class="input-field text-sm py-1 px-2" data-edit-price="${itemId}">`;

    const nameInput = nameP.querySelector(`[data-edit-name="${itemId}"]`);
    const priceInput = priceP.querySelector(`[data-edit-price="${itemId}"]`);

    priceInput.focus();
    priceInput.select();

    let isEditingItem = true;

    const saveItem = () => {
        if (!isEditingItem) return;
        
        const newName = nameInput.value.trim();
        const newPrice = parseFloat(priceInput.value);

        let hasChanges = false;
        if (newName && newName !== originalName) {
            item.name = newName;
            hasChanges = true;
        }
        if (!isNaN(newPrice) && newPrice >= 0 && newPrice !== originalPrice) {
            item.price = newPrice;
            hasChanges = true;
        }

        if (hasChanges) {
            calculateAndRenderSplit();
            saveState();
        }
        isEditingItem = false;
        render();
    };

    [nameInput, priceInput].forEach(input => {
        input.addEventListener('keyup', (e) => e.key === 'Enter' && saveItem());
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (!nameInput.matches(':focus') && !priceInput.matches(':focus')) {
                    saveItem();
                }
            }, 100);
        });
    });
}

// --- RENDERING ---
function renderPeople() {
    if (state.people.length === 0) {
        dom.peopleListDiv.innerHTML = '<p class="text-gray-500 text-sm">No people added yet.</p>';
        return;
    }
    
    dom.peopleListDiv.innerHTML = state.people.map(person => `
        <div class="flex items-center justify-between bg-gray-100 p-2 rounded-md">
            <span class="font-medium person-name" data-person-id="${person.id}">${person.name}</span>
            <div class="flex gap-2">
                <button class="text-blue-500 hover:text-blue-700 text-sm" onclick="editPersonName(${person.id})">✏️</button>
                <button class="text-red-500 hover:text-red-700 font-bold" onclick="deletePerson(${person.id})">&times;</button>
            </div>
        </div>
    `).join('');
}

function renderItems() {
    if (state.items.length === 0) {
        dom.itemsListDiv.innerHTML = '<p class="text-gray-500 text-sm">No items added yet.</p>';
        return;
    }

    dom.itemsListDiv.innerHTML = state.items.map(item => {
        const quantityInputsHTML = state.people.map(person => {
            const currentQuantity = item.personQuantities?.[person.id] || '';
            const totalQuantities = Object.values(item.personQuantities || {}).reduce((sum, qty) => {
                const numQty = parseFloat(qty) || 0;
                return sum + numQty;
            }, 0);
            const numCurrentQuantity = parseFloat(currentQuantity) || 0;
            const personAmount = totalQuantities > 0 && numCurrentQuantity > 0 ? 
                (numCurrentQuantity / totalQuantities) * item.price : 0;
            
            return `
                <div class="flex items-center mr-4 mb-2">
                    <span class="text-sm w-16 mr-2">${person.name}:</span>
                    <input type="number" 
                           class="input-field text-sm py-1 px-2 w-16" 
                           placeholder="0" 
                           step="1" 
                           min="0"
                           value="${currentQuantity}"
                           onchange="updatePersonQuantity(${item.id}, ${person.id}, this.value)"
                           onblur="updatePersonQuantity(${item.id}, ${person.id}, this.value)">
                    ${numCurrentQuantity > 0 ? `<span class="text-xs text-gray-500 ml-1">($${personAmount.toFixed(2)})</span>` : ''}
                </div>
            `;
        }).join('');

        const totalQuantities = Object.values(item.personQuantities || {}).reduce((sum, qty) => {
            const numQty = parseFloat(qty) || 0;
            return sum + numQty;
        }, 0);
        const actionButtonsHTML = state.people.length > 0 ? `
            <div class="flex gap-2 mb-2">
                <button class="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600" 
                        onclick="splitEvenly(${item.id})">Give 1 to Each</button>
                <button class="text-xs bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600" 
                        onclick="clearAllQuantities(${item.id})">Clear All</button>
            </div>
            <div class="text-xs text-blue-600">
                Total quantities: ${totalQuantities} | Price per unit: $${totalQuantities > 0 ? (item.price / totalQuantities).toFixed(2) : '0.00'}
            </div>
        ` : '';

        return `
            <div class="p-4 border border-gray-200 rounded-lg">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-semibold item-name" data-item-id="${item.id}">${item.name}</p>
                        <p class="text-gray-600 item-price" data-item-price-id="${item.id}">$${item.price.toFixed(2)}</p>
                    </div>
                    <div class="flex gap-2">
                        <button class="text-blue-500 hover:text-blue-700 text-sm" onclick="editItem(${item.id})">✏️</button>
                        <button class="text-red-500 hover:text-red-700 font-bold text-xl" onclick="deleteItem(${item.id})">&times;</button>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-gray-200">
                    <p class="text-xs font-medium text-gray-500 mb-2">Quantity per person:</p>
                    ${actionButtonsHTML}
                    <div class="mt-2">
                        ${state.people.length > 0 ? quantityInputsHTML : '<p class="text-xs text-gray-400">Add people to assign quantities.</p>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleTranspose() {
    state.isTransposed = !state.isTransposed;
    calculateAndRenderSplit();
    saveState();
}

function calculateAndRenderSplit() {
    if (state.people.length === 0) {
        dom.resultsSection.innerHTML = '<p class="text-center text-gray-500">Add people and items to see the breakdown.</p>';
        return;
    }

    const taxRate = state.tax / 100 || 0;
    const tipRate = state.tip / 100 || 0;

    let personTotals = state.people.map(p => ({ ...p, subtotal: 0 }));
    let totalBillSubtotal = 0;

    // Calculate individual shares based on quantities
    state.items.forEach(item => {
        if (item.personQuantities) {
            const totalQuantities = Object.values(item.personQuantities).reduce((sum, qty) => {
                const numQty = parseFloat(qty) || 0;
                return sum + numQty;
            }, 0);
            if (totalQuantities > 0) {
                const pricePerUnit = item.price / totalQuantities;
                Object.entries(item.personQuantities).forEach(([personId, quantity]) => {
                    const person = personTotals.find(p => p.id === parseInt(personId));
                    const numQuantity = parseFloat(quantity) || 0;
                    if (person && numQuantity > 0) {
                        person.subtotal += numQuantity * pricePerUnit;
                    }
                });
            }
        }
        totalBillSubtotal += item.price;
    });

    let tableHTML;

    if (state.isTransposed) {
        // Transposed view: People as rows, Items as columns, Summary as additional columns
        tableHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr class="border-b">
                            <th class="py-2 px-4">Person</th>
                            ${state.items.map(item => `<th class="py-2 px-4 text-center">${item.name}<br><span class="text-xs text-gray-600">($${item.price.toFixed(2)})</span></th>`).join('')}
                            <th class="py-2 px-4 text-center border-l-2 border-gray-400">Subtotal</th>
                            <th class="py-2 px-4 text-center">Tax</th>
                            <th class="py-2 px-4 text-center">Tip</th>
                            <th class="py-2 px-4 text-center">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Person rows
        personTotals.forEach(person => {
            const personTax = person.subtotal * taxRate;
            const personTip = person.subtotal * tipRate;
            const personTotal = person.subtotal + personTax + personTip;

            tableHTML += `
                <tr class="border-b">
                    <td class="py-2 px-4 font-medium">${person.name}</td>
                    ${state.items.map(item => {
                        const totalQuantities = Object.values(item.personQuantities || {}).reduce((sum, qty) => {
                            const numQty = parseFloat(qty) || 0;
                            return sum + numQty;
                        }, 0);
                        const pricePerUnit = totalQuantities > 0 ? item.price / totalQuantities : 0;
                        const personQuantity = item.personQuantities?.[person.id];
                        const numPersonQuantity = parseFloat(personQuantity) || 0;
                        if (personQuantity && numPersonQuantity > 0) {
                            const personAmount = numPersonQuantity * pricePerUnit;
                            return `<td class="py-2 px-4 text-center">${numPersonQuantity}× = ${personAmount.toFixed(2)}</td>`;
                        }
                        return '<td class="py-2 px-4 text-center">-</td>';
                    }).join('')}
                    <td class="py-2 px-4 text-center border-l-2 border-gray-400">${person.subtotal.toFixed(2)}</td>
                    <td class="py-2 px-4 text-center">${personTax.toFixed(2)}</td>
                    <td class="py-2 px-4 text-center">${personTip.toFixed(2)}</td>
                    <td class="py-2 px-4 text-center font-bold">${personTotal.toFixed(2)}</td>
                </tr>
            `;
        });

        tableHTML += '</tbody></table></div>';
    } else {
        // Original view: Items as rows, People as columns
        tableHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr class="border-b">
                            <th class="py-2 px-4">Item</th>
                            ${personTotals.map(person => `<th class="py-2 px-4 text-center">${person.name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Item rows
        state.items.forEach(item => {
            const totalQuantities = Object.values(item.personQuantities || {}).reduce((sum, qty) => {
                const numQty = parseFloat(qty) || 0;
                return sum + numQty;
            }, 0);
            const pricePerUnit = totalQuantities > 0 ? item.price / totalQuantities : 0;

            tableHTML += `
                <tr class="border-b">
                    <td class="py-2 px-4 font-medium">${item.name}<br><span class="text-sm text-gray-600">($${item.price.toFixed(2)})</span></td>
                    ${personTotals.map(person => {
                        const personQuantity = item.personQuantities?.[person.id];
                        const numPersonQuantity = parseFloat(personQuantity) || 0;
                        if (personQuantity && numPersonQuantity > 0) {
                            const personAmount = numPersonQuantity * pricePerUnit;
                            return `<td class="py-2 px-4 text-center">${numPersonQuantity}× = ${personAmount.toFixed(2)}</td>`;
                        }
                        return '<td class="py-2 px-4 text-center">-</td>';
                    }).join('')}
                </tr>
            `;
        });

        // Summary rows
        let grandTotal = 0;
        ['Subtotal', 'Tax', 'Tip', 'Total'].forEach((summaryType, index) => {
            const isTotal = summaryType === 'Total';
            const borderClass = index === 0 ? 'border-t-2 border-gray-400 border-b summary-row' :
                               isTotal ? 'border-t-2 border-gray-400 summary-row' : 'border-b summary-row';

            tableHTML += `<tr class="${borderClass}"><td class="py-2 px-4 font-semibold">${summaryType}</td>`;

            personTotals.forEach(person => {
                const personTax = person.subtotal * taxRate;
                const personTip = person.subtotal * tipRate;
                const personTotal = person.subtotal + personTax + personTip;

                let value;
                switch(summaryType) {
                    case 'Subtotal': value = person.subtotal; break;
                    case 'Tax': value = personTax; break;
                    case 'Tip': value = personTip; break;
                    case 'Total':
                        value = personTotal;
                        grandTotal += personTotal;
                        break;
                }

                const cellClass = isTotal ? 'font-bold' : '';
                tableHTML += `<td class="py-2 px-4 text-center ${cellClass}">${value.toFixed(2)}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table></div>';
    }

    // Bill summary
    const totalTax = totalBillSubtotal * taxRate;
    const totalTip = totalBillSubtotal * tipRate;
    let grandTotal = 0;
    personTotals.forEach(person => {
        const personTax = person.subtotal * taxRate;
        const personTip = person.subtotal * tipRate;
        grandTotal += person.subtotal + personTax + personTip;
    });

    const summaryHTML = `
        <div class="mt-6 p-4 bg-gray-100 rounded-lg w-full">
            <h3 class="font-bold text-lg">Bill Summary</h3>
            <div class="mt-2 space-y-1">
                <div class="flex justify-between"><span>Subtotal</span> <span>$${totalBillSubtotal.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>Tax (${(taxRate*100).toFixed(0)}%)</span> <span>$${totalTax.toFixed(2)}</span></div>
                <div class="flex justify-between"><span>Tip (${(tipRate*100).toFixed(0)}%)</span> <span>$${totalTip.toFixed(2)}</span></div>
                <div class="flex justify-between font-bold text-xl mt-2 pt-2 border-t"><span>Grand Total</span> <span>$${grandTotal.toFixed(2)}</span></div>
            </div>
        </div>
    `;

    dom.resultsSection.innerHTML = tableHTML + summaryHTML;
}

// --- UTILITIES ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-gray-800';
    toast.className = `fixed bottom-5 right-5 ${bgColor} text-white py-2 px-4 rounded-lg shadow-lg`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- STORAGE ---
function saveState() {
    try {
        localStorage.setItem('lunchSplitterState', JSON.stringify(state));
    } catch (error) {
        console.error("Error saving state:", error);
        showToast('Error saving data.', 'error');
    }
}

// --- URL SHARING ---
function generateShareableURL() {
    try {
        const url = new URL(window.location.origin + window.location.pathname);

        // People: comma-separated names
        if (state.people.length > 0) {
            url.searchParams.set('p', state.people.map(p => p.name).join(','));
        }

        // Items: format "name:price" separated by semicolons
        if (state.items.length > 0) {
            const itemsStr = state.items.map(item => `${item.name}:${item.price}`).join(';');
            url.searchParams.set('i', itemsStr);
        }

        // Quantities: format "itemIndex-personIndex:quantity" separated by semicolons
        const quantities = [];
        state.items.forEach((item, itemIdx) => {
            if (item.personQuantities) {
                state.people.forEach((person, personIdx) => {
                    const qty = item.personQuantities[person.id];
                    if (qty) {
                        quantities.push(`${itemIdx}-${personIdx}:${qty}`);
                    }
                });
            }
        });
        if (quantities.length > 0) {
            url.searchParams.set('q', quantities.join(';'));
        }

        // Tax and tip
        if (state.tax) url.searchParams.set('tax', state.tax);
        if (state.tip) url.searchParams.set('tip', state.tip);

        return url.toString();
    } catch (error) {
        console.error("Error generating shareable URL:", error);
        return null;
    }
}

function copyShareLink() {
    if (state.people.length === 0 && state.items.length === 0) {
        showToast('Please add people and items first before sharing.', 'error');
        return;
    }

    const shareURL = generateShareableURL();
    if (!shareURL) {
        showToast('Failed to generate share link.', 'error');
        return;
    }

    navigator.clipboard.writeText(shareURL)
        .then(() => {
            showToast('Share link copied to clipboard!', 'success');
        })
        .catch((error) => {
            console.error('Failed to copy link:', error);
            // Fallback: show the URL in a prompt
            prompt('Copy this link to share:', shareURL);
        });
}

function loadStateFromURL() {
    try {
        const urlParams = new URLSearchParams(window.location.search);

        // Check for old base64 format first (backwards compatibility)
        const oldData = urlParams.get('data');
        if (oldData) {
            const decompressed = JSON.parse(decodeURIComponent(atob(oldData)));
            return decompressed;
        }

        // Check for new readable format
        const peopleParam = urlParams.get('p');
        const itemsParam = urlParams.get('i');

        if (!peopleParam && !itemsParam) {
            return null; // No data in URL
        }

        const newState = {
            people: [],
            items: [],
            nextPersonId: 0,
            nextItemId: 0,
            tax: parseFloat(urlParams.get('tax')) || 0,
            tip: parseFloat(urlParams.get('tip')) || 10
        };

        // Parse people
        if (peopleParam) {
            newState.people = peopleParam.split(',').map((name, idx) => ({
                id: idx,
                name: name.trim()
            }));
            newState.nextPersonId = newState.people.length;
        }

        // Parse items
        if (itemsParam) {
            newState.items = itemsParam.split(';').map((itemStr, idx) => {
                const [name, price] = itemStr.split(':');
                return {
                    id: idx,
                    name: name.trim(),
                    price: parseFloat(price) || 0,
                    personQuantities: {}
                };
            });
            newState.nextItemId = newState.items.length;
        }

        // Parse quantities
        const quantitiesParam = urlParams.get('q');
        if (quantitiesParam && newState.items.length > 0 && newState.people.length > 0) {
            quantitiesParam.split(';').forEach(qtyStr => {
                const [indices, qty] = qtyStr.split(':');
                const [itemIdx, personIdx] = indices.split('-').map(Number);

                if (newState.items[itemIdx] && newState.people[personIdx]) {
                    const personId = newState.people[personIdx].id;
                    newState.items[itemIdx].personQuantities[personId] = parseFloat(qty);
                }
            });
        }

        return newState;
    } catch (error) {
        console.error("Error loading from URL:", error);
        showToast('Error loading data from URL.', 'error');
    }
    return null;
}

function loadState() {
    try {
        // First try URL params (for sharing), then localStorage
        let loadedState = loadStateFromURL();
        const fromURL = !!loadedState;

        if (!loadedState) {
            const saved = localStorage.getItem('lunchSplitterState');
            if (saved) {
                loadedState = JSON.parse(saved);
            }
        }

        if (loadedState) {
            // Migrate old formats to new format (personQuantities)
            const migratedItems = (loadedState.items || []).map(item => {
                // Migrate from sharedBy (checkbox format) to personQuantities
                if (item.sharedBy && !item.personQuantities && !item.personAmounts) {
                    const personQuantities = {};
                    item.sharedBy.forEach(personId => {
                        personQuantities[personId] = 1; // 1 quantity each
                    });
                    return { ...item, personQuantities, sharedBy: undefined };
                }
                // Migrate from personAmounts (amount format) to personQuantities
                if (item.personAmounts && !item.personQuantities) {
                    const personQuantities = {};
                    // For backwards compatibility, assume equal quantities if amounts were equal
                    const amounts = Object.values(item.personAmounts);
                    const allEqualAmounts = amounts.length > 0 && amounts.every(amt => Math.abs(amt - amounts[0]) < 0.01);
                    
                    if (allEqualAmounts) {
                        Object.keys(item.personAmounts).forEach(personId => {
                            personQuantities[personId] = 1;
                        });
                    } else {
                        // Convert amounts to quantities (this is approximate)
                        const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0);
                        Object.entries(item.personAmounts).forEach(([personId, amount]) => {
                            personQuantities[personId] = totalAmount > 0 ? (amount / totalAmount) * amounts.length : 1;
                        });
                    }
                    return { ...item, personQuantities, personAmounts: undefined };
                }
                return item;
            });

            Object.assign(state, {
                people: loadedState.people || [],
                items: migratedItems,
                nextPersonId: loadedState.nextPersonId || 0,
                nextItemId: loadedState.nextItemId || 0,
                tax: loadedState.tax !== undefined ? loadedState.tax : 0,
                tip: loadedState.tip !== undefined ? loadedState.tip : 10,
                isTransposed: loadedState.isTransposed || false
            });
            
            // Sync HTML inputs
            dom.taxInput.value = state.tax;
            dom.tipInput.value = state.tip;

            // Clear URL params if loaded from URL to keep URL clean
            if (fromURL) {
                window.history.replaceState({}, '', window.location.pathname);
                showToast('Bill loaded from shared link!', 'success');
            } else {
                showToast('Data loaded from previous session.', 'info');
            }
        }
    } catch (error) {
        console.error("Error loading state:", error);
        showToast('Error loading data.', 'error');
    }
}

function clearState() {
    try {
        localStorage.removeItem('lunchSplitterState');
        Object.assign(state, {
            people: [],
            items: [],
            nextPersonId: 0,
            nextItemId: 0,
            tax: 0,
            tip: 10,
            isTransposed: false
        });

        dom.personNameInput.value = '';
        dom.itemNameInput.value = '';
        dom.itemPriceInput.value = '';
        dom.taxInput.value = 0;
        dom.tipInput.value = 10;

        // Clear URL params
        window.history.replaceState({}, '', window.location.pathname);

        render();
        showToast('Data cleared successfully!', 'success');
    } catch (error) {
        console.error("Error clearing state:", error);
        showToast('Error clearing data.', 'error');
    }
}

// --- EXPORT ---
function exportAsJSON() {
    try {
        const dataStr = JSON.stringify(state, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lunch-splitter-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Data exported as JSON successfully!', 'success');
    } catch (error) {
        console.error('Error exporting JSON:', error);
        showToast('Failed to export data as JSON.', 'error');
    }
}

function importFromJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);

            // Validate the structure
            if (!imported.people || !imported.items ||
                typeof imported.nextPersonId !== 'number' ||
                typeof imported.nextItemId !== 'number') {
                throw new Error('Invalid data structure');
            }

            // Merge the imported data into state
            Object.assign(state, {
                people: imported.people || [],
                items: imported.items || [],
                nextPersonId: imported.nextPersonId || 0,
                nextItemId: imported.nextItemId || 0,
                tax: imported.tax !== undefined ? imported.tax : 0,
                tip: imported.tip !== undefined ? imported.tip : 10
            });

            // Update UI
            dom.taxInput.value = state.tax;
            dom.tipInput.value = state.tip;

            render();
            saveState();
            showToast('Data imported successfully!', 'success');
        } catch (error) {
            console.error('Error importing JSON:', error);
            showToast('Failed to import data. Please check the file format.', 'error');
        }
    };
    reader.onerror = () => {
        showToast('Failed to read file.', 'error');
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again
    event.target.value = '';
}

async function exportSummaryAsImage() {
    try {
        const cardElement = document.getElementById('results-section');
        if (!cardElement || cardElement.innerHTML.includes('Add people and items to see the breakdown')) {
            showToast('Please add people and items first before exporting.', 'error');
            return;
        }

        // Handle overflow containers
        const overflowContainers = cardElement.querySelectorAll('.overflow-x-auto');
        const originalOverflows = [];
        
        overflowContainers.forEach((container, index) => {
            originalOverflows[index] = container.style.overflow;
            container.style.overflow = 'visible';
            container.style.width = 'auto';
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Match widths for better export
        const summaryCard = cardElement.querySelector('.bg-gray-100');
        const table = cardElement.querySelector('table');
        let originalSummaryWidth = null;
        
        if (summaryCard && table) {
            originalSummaryWidth = summaryCard.style.width;
            const tableWidth = table.scrollWidth;
            summaryCard.style.width = tableWidth + 'px';
            summaryCard.style.minWidth = tableWidth + 'px';
            summaryCard.style.maxWidth = tableWidth + 'px';
        }

        const canvas = await html2canvas(cardElement, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
            x: -16,
            y: -16,
            width: Math.max(cardElement.scrollWidth, cardElement.offsetWidth) + 32,
            height: cardElement.scrollHeight + 32,
            windowWidth: Math.max(cardElement.scrollWidth, cardElement.offsetWidth) + 32,
            windowHeight: cardElement.scrollHeight + 32
        });

        // Restore styles
        overflowContainers.forEach((container, index) => {
            container.style.overflow = originalOverflows[index] || '';
            container.style.width = '';
        });
        
        if (summaryCard) {
            summaryCard.style.width = originalSummaryWidth || '';
            summaryCard.style.minWidth = '';
            summaryCard.style.maxWidth = '';
        }

        // Download
        const link = document.createElement('a');
        link.download = `lunch-split-${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Bill summary exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting:', error);
        showToast('Failed to export summary.', 'error');
    }
}

// --- INITIALIZE ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
