# Technical Specification: Team Builder Application

## Task Difficulty Assessment
**Difficulty**: Medium

This task requires moderate complexity with several interactive features including dynamic UI updates, state management, group constraints, and a team shuffling algorithm that respects gender balance and required groupings.

---

## Technical Context

### Language & Dependencies
- **HTML5**: Semantic markup for structure
- **CSS3**: Modern styling with flexbox/grid layouts
- **Vanilla JavaScript (ES6+)**: No external dependencies, pure JavaScript implementation

### Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES6+ features (arrow functions, const/let, template literals, array methods)

---

## Implementation Approach

### 1. User Interface Design
- **Header Section**: Title and controls
- **Options Section**: 
  - Gender balance toggle checkbox
  - Team count input
- **People Management Section**:
  - List of added people with name input
  - Gender toggle (male/female) when gender balance is enabled
  - Remove button (-) for each person
  - Add button (+) to add new person
- **Group Constraints Section**:
  - UI to define required groupings (people who must be on same team)
  - Add/remove group constraints
- **Action Section**:
  - "Shuffle Teams" button to generate teams
- **Results Section**:
  - Display generated teams with member names

### 2. Core Functionality
- **Person Management**: Add/remove people dynamically
- **Gender Toggle**: Show/hide gender selection based on checkbox
- **Group Constraints**: Define groups of people who must be together
- **Team Shuffling Algorithm**:
  - Respect required groupings (treat as single units)
  - Balance gender distribution if enabled
  - Randomly distribute remaining individuals
  - Handle edge cases (insufficient people, unbalanced groups)

### 3. Data Structure
```javascript
{
  people: [
    { id: number, name: string, gender: 'male'|'female' }
  ],
  requiredGroups: [
    [id1, id2, id3], // IDs of people who must be together
    [id4, id5]
  ],
  genderBalanceEnabled: boolean,
  teamCount: number
}
```

---

## Source Code Structure

### Files to Create

1. **index.html**
   - Main HTML structure
   - Semantic sections for all UI components
   - Inline or linked CSS/JS

2. **style.css** (or inline in HTML)
   - Layout styling (flexbox/grid)
   - Component styling (buttons, inputs, cards)
   - Responsive design
   - Visual feedback (hover states, disabled states)

3. **script.js** (or inline in HTML)
   - State management
   - DOM manipulation functions
   - Event handlers
   - Team shuffling algorithm
   - Utility functions

---

## Data Model / API / Interface Changes

### State Management
The application maintains a single state object:
```javascript
const state = {
  people: [],
  requiredGroups: [],
  genderBalanceEnabled: false,
  teamCount: 2,
  nextId: 1
};
```

### Key Functions
- `addPerson()`: Add new person to the list
- `removePerson(id)`: Remove person by ID
- `toggleGenderBalance()`: Enable/disable gender selection
- `addRequiredGroup(personIds)`: Add group constraint
- `removeRequiredGroup(index)`: Remove group constraint
- `shuffleTeams()`: Generate teams based on constraints
- `renderPeople()`: Update people list UI
- `renderResults(teams)`: Display generated teams

---

## Algorithm Details

### Team Shuffling Algorithm
1. **Validate Input**: Ensure sufficient people and valid team count
2. **Process Required Groups**: Treat each group as a single unit
3. **Separate by Gender** (if enabled): Categorize remaining individuals
4. **Distribute Groups**: Randomly assign required groups to teams
5. **Distribute Individuals**: 
   - If gender balance enabled: Alternate or evenly distribute genders
   - Otherwise: Random distribution
6. **Balance Teams**: Ensure teams are roughly equal in size

### Edge Cases to Handle
- Empty people list
- Team count larger than number of people/groups
- Unbalanced gender ratios
- Required groups that are too large for a single team
- Invalid group constraints (referencing non-existent people)

---

## Verification Approach

### Manual Testing
1. **Basic Operations**:
   - Add 10+ people with various names
   - Remove people from the list
   - Verify UI updates correctly

2. **Gender Balance Feature**:
   - Enable gender balance checkbox
   - Verify gender toggles appear
   - Set mix of male/female
   - Shuffle and verify balanced distribution

3. **Required Groups**:
   - Create groups of 2-4 people
   - Shuffle teams
   - Verify grouped people stay together

4. **Combined Scenarios**:
   - Test with both gender balance and required groups
   - Test with various team counts (2, 3, 4, 5 teams)
   - Test edge cases (empty list, single person, etc.)

5. **UI/UX**:
   - Verify all buttons are functional
   - Check responsive layout
   - Verify error messages for invalid states

### Test Cases
- Add 12 people, 3 teams, no constraints → 4 people per team
- Add 10 people (5M, 5F), 2 teams, gender balance → Each team has 2-3 of each gender
- Add 8 people with groups [1,2,3] and [4,5], 2 teams → Groups stay together
- Add 0 people, click shuffle → Display error message
- Add 3 people, 5 teams → Display appropriate error/warning

### Automated Testing
Not applicable for this implementation (vanilla JS, no test framework specified)

---

## Implementation Complexity Breakdown

**Easy Components** (30%):
- Basic HTML structure
- CSS styling
- Add/remove person functionality

**Medium Components** (50%):
- Gender toggle conditional rendering
- Required groups UI and management
- State management
- DOM updates

**Complex Components** (20%):
- Team shuffling algorithm with constraints
- Gender balancing logic
- Edge case handling
