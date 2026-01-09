const state = {
    people: [],
    requiredGroups: [],
    genderBalanceEnabled: false,
    weightBalanceEnabled: false,
    membersPerTeam: 4,
    nextId: 1,
    ungroupedColor: '#94a3b8',
    groupColors: [
        '#f59e0b', '#10b981', '#ec4899', '#667eea',
        '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
        '#a855f7', '#84cc16', '#f43f5e', '#6366f1'
    ]
};

const elements = {
    genderBalanceCheckbox: document.getElementById('genderBalanceCheckbox'),
    weightBalanceCheckbox: document.getElementById('weightBalanceCheckbox'),
    teamSizeInput: document.getElementById('teamSizeInput'),
    nameInput: document.getElementById('nameInput'),
    addPersonBtn: document.getElementById('addPersonBtn'),
    resetBtn: document.getElementById('resetBtn'),
    peopleList: document.getElementById('peopleList'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    resultsSection: document.getElementById('resultsSection'),
    teamsDisplay: document.getElementById('teamsDisplay')
};

function init() {
    elements.genderBalanceCheckbox.addEventListener('change', handleGenderBalanceToggle);
    elements.weightBalanceCheckbox.addEventListener('change', handleWeightBalanceToggle);
    elements.teamSizeInput.addEventListener('change', handleTeamSizeChange);
    elements.addPersonBtn.addEventListener('click', addPerson);
    elements.resetBtn.addEventListener('click', resetAll);
    elements.nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addPerson();
        }
    });
    elements.shuffleBtn.addEventListener('click', shuffleTeams);
    
    renderPeople();
}

function resetAll() {
    if (!confirm('모든 데이터를 초기화하시겠습니까?')) {
        return;
    }
    state.people = [];
    state.requiredGroups = [];
    state.nextId = 1;
    elements.resultsSection.style.display = 'none';
    renderPeople();
}

function handleGenderBalanceToggle(e) {
    state.genderBalanceEnabled = e.target.checked;
    renderPeople();
}

function handleWeightBalanceToggle(e) {
    state.weightBalanceEnabled = e.target.checked;
    renderPeople();
}

function handleTeamSizeChange(e) {
    state.membersPerTeam = parseInt(e.target.value) || 4;
}

function addPerson() {
    const input = elements.nameInput.value.trim();
    
    if (input === '') {
        alert('이름을 입력해주세요.');
        return;
    }
    
    const groups = input.split('/').map(g => g.trim()).filter(g => g !== '');
    
    if (groups.length === 0) {
        alert('이름을 입력해주세요.');
        return;
    }
    
    groups.forEach(group => {
        const names = group.split(',').map(n => n.trim()).filter(n => n !== '');
        
        if (names.length === 0) return;
        
        const newIds = [];
        
        names.forEach(name => {
            const person = {
                id: state.nextId++,
                name: name,
                gender: 'male',
                weight: 100
            };
            state.people.push(person);
            newIds.push(person.id);
        });
        
        if (names.length > 1) {
            state.requiredGroups.push(newIds);
        }
    });
    
    elements.nameInput.value = '';
    elements.nameInput.focus();
    renderPeople();
}

function removePerson(id) {
    state.people = state.people.filter(p => p.id !== id);
    state.requiredGroups = state.requiredGroups.map(group => group.filter(pid => pid !== id));
    state.requiredGroups = state.requiredGroups.filter(group => group.length > 1);
    renderPeople();
}

function updatePersonGender(id, gender) {
    const person = state.people.find(p => p.id === id);
    if (person) {
        person.gender = gender;
    }
}

function updatePersonWeight(id, weight) {
    const person = state.people.find(p => p.id === id);
    if (person) {
        person.weight = parseInt(weight) || 0;
    }
}

function getPersonGroupIndex(personId) {
    return state.requiredGroups.findIndex(group => group.includes(personId));
}

function getGroupColor(groupIndex) {
    if (groupIndex === -1) {
        return state.ungroupedColor;
    }
    return state.groupColors[groupIndex % state.groupColors.length];
}

function createPersonTag(person) {
    const personTag = document.createElement('div');
    personTag.className = 'person-tag';
    
    if (state.genderBalanceEnabled) {
        personTag.style.backgroundColor = person.gender === 'male' ? '#e0f2fe' : '#fce7f3';
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = person.name;
    personTag.appendChild(nameSpan);
    
    if (state.genderBalanceEnabled) {
        const genderToggle = document.createElement('button');
        genderToggle.className = 'gender-toggle-circle';
        genderToggle.textContent = person.gender === 'male' ? '♂️' : '♀️';
        genderToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const newGender = person.gender === 'male' ? 'female' : 'male';
            updatePersonGender(person.id, newGender);
            renderPeople();
        });
        personTag.appendChild(genderToggle);
    }
    
    if (state.weightBalanceEnabled) {
        const weightInput = document.createElement('input');
        weightInput.type = 'number';
        weightInput.className = 'weight-input';
        weightInput.value = person.weight;
        weightInput.min = '0';
        weightInput.addEventListener('input', (e) => {
            updatePersonWeight(person.id, e.target.value);
        });
        personTag.appendChild(weightInput);
    }
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => removePerson(person.id));
    
    personTag.appendChild(removeBtn);
    
    return personTag;
}

function renderPeople() {
    elements.peopleList.innerHTML = '';
    
    const grouped = new Set();
    
    state.requiredGroups.forEach((group, groupIndex) => {
        const groupContainer = document.createElement('div');
        groupContainer.className = 'group-container';
        groupContainer.style.borderColor = getGroupColor(groupIndex);
        
        group.forEach(personId => {
            const person = state.people.find(p => p.id === personId);
            if (person) {
                grouped.add(personId);
                const personTag = createPersonTag(person);
                groupContainer.appendChild(personTag);
            }
        });
        
        elements.peopleList.appendChild(groupContainer);
    });
    
    state.people.forEach(person => {
        if (!grouped.has(person.id)) {
            const personTag = createPersonTag(person);
            elements.peopleList.appendChild(personTag);
        }
    });
}

function shuffleTeams() {
    if (state.people.length === 0) {
        showError('참가자를 추가해주세요.');
        return;
    }
    
    const validPeople = state.people.filter(p => p.name.trim() !== '');
    if (validPeople.length === 0) {
        showError('최소 1명 이상의 이름을 입력해주세요.');
        return;
    }
    
    if (state.membersPerTeam < 2) {
        showError('팀 인원수는 최소 2명 이상이어야 합니다.');
        return;
    }
    
    if (validPeople.length < state.membersPerTeam) {
        showError('참가자 수가 팀 인원수보다 적습니다.');
        return;
    }
    
    const teams = generateTeams(validPeople);
    displayTeams(teams);
}

function generateTeams(people) {
    const teamCount = Math.ceil(people.length / state.membersPerTeam);
    const teams = Array.from({ length: teamCount }, () => []);
    const assigned = new Set();
    
    const validGroups = state.requiredGroups.filter(group => 
        group.every(id => people.some(p => p.id === id))
    );
    
    validGroups.forEach(group => {
        group.forEach(id => assigned.add(id));
    });
    
    const shuffledGroups = [...validGroups].sort(() => Math.random() - 0.5);
    shuffledGroups.forEach((group, index) => {
        const teamIndex = index % teamCount;
        const groupMembers = group.map(id => people.find(p => p.id === id)).filter(Boolean);
        teams[teamIndex].push(...groupMembers);
    });
    
    const unassignedPeople = people.filter(p => !assigned.has(p.id));
    
    if (state.genderBalanceEnabled) {
        const shuffled = unassignedPeople.sort(() => Math.random() - 0.5);
        
        shuffled.forEach(person => {
            const teamStats = teams.map((team, idx) => {
                const genderCount = team.filter(p => p.gender === person.gender).length;
                const totalWeight = team.reduce((sum, p) => sum + (p.weight || 0), 0);
                return { idx, genderCount, totalSize: team.length, totalWeight };
            });
            
            const minGenderCount = Math.min(...teamStats.map(t => t.genderCount));
            const teamsWithMinGender = teamStats.filter(t => t.genderCount === minGenderCount);
            
            const minSize = Math.min(...teamsWithMinGender.map(t => t.totalSize));
            const bestTeams = teamsWithMinGender.filter(t => t.totalSize === minSize);
            
            let chosenTeam;
            if (state.weightBalanceEnabled) {
                const minWeight = Math.min(...bestTeams.map(t => t.totalWeight));
                const lightestTeams = bestTeams.filter(t => t.totalWeight === minWeight);
                chosenTeam = lightestTeams[Math.floor(Math.random() * lightestTeams.length)];
            } else {
                chosenTeam = bestTeams[Math.floor(Math.random() * bestTeams.length)];
            }
            
            teams[chosenTeam.idx].push(person);
        });
    } else if (state.weightBalanceEnabled) {
        const sorted = unassignedPeople.sort((a, b) => b.weight - a.weight);
        
        sorted.forEach(person => {
            const teamSizes = teams.map(t => t.length);
            const minSize = Math.min(...teamSizes);
            const smallestTeams = teams.map((team, idx) => ({ team, idx, size: team.length }))
                .filter(t => t.size === minSize);
            
            const teamWeights = smallestTeams.map(t => 
                t.team.reduce((sum, p) => sum + (p.weight || 0), 0)
            );
            const minWeightTeam = smallestTeams[teamWeights.indexOf(Math.min(...teamWeights))];
            teams[minWeightTeam.idx].push(person);
        });
    } else {
        const shuffled = unassignedPeople.sort(() => Math.random() - 0.5);
        shuffled.forEach(person => {
            const teamSizes = teams.map(t => t.length);
            const minSizeIndex = teamSizes.indexOf(Math.min(...teamSizes));
            teams[minSizeIndex].push(person);
        });
    }
    
    return teams;
}

function displayTeams(teams) {
    elements.teamsDisplay.innerHTML = '';
    
    teams.forEach((team, index) => {
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card';
        
        const teamTitle = document.createElement('h3');
        let titleText = `팀 ${index + 1} (${team.length}명)`;
        if (state.weightBalanceEnabled) {
            const teamWeight = team.reduce((sum, p) => sum + (p.weight || 0), 0);
            titleText += ` - 가중치: ${teamWeight}`;
        }
        teamTitle.textContent = titleText;
        teamCard.appendChild(teamTitle);
        
        const membersList = document.createElement('ul');
        team.forEach(person => {
            const li = document.createElement('li');
            let displayText = person.name;
            if (state.weightBalanceEnabled) {
                displayText += ` (${person.weight})`;
            }
            li.textContent = displayText;
            
            if (state.genderBalanceEnabled) {
                const genderColor = person.gender === 'male' ? '#3b82f6' : '#ec4899';
                li.style.borderLeft = `4px solid ${genderColor}`;
            }
            
            const groupIndex = getPersonGroupIndex(person.id);
            if (groupIndex !== -1) {
                const color = getGroupColor(groupIndex);
                const dotSpan = document.createElement('span');
                dotSpan.className = 'result-group-dot';
                dotSpan.style.backgroundColor = color;
                li.appendChild(dotSpan);
            }
            membersList.appendChild(li);
        });
        
        teamCard.appendChild(membersList);
        elements.teamsDisplay.appendChild(teamCard);
    });
    
    elements.resultsSection.classList.add('visible');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
    elements.teamsDisplay.innerHTML = `<div class="error-message">${message}</div>`;
    elements.resultsSection.classList.add('visible');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

init();
