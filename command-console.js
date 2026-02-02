// ==================== 명령어 콘솔 ====================

const commandConsole = {
	output: null,
	input: null,
	savedPosition: { x: 0, y: 0, width: '900px', height: '600px' }, // 최소화 전 위치와 크기 저장
	dragState: null, // 드래그 상태 저장
	inputMode: 'normal', // 입력 모드: 'normal', 'auth', 'profile', 'password', 'password-confirm', 'password-ask'
	tempProfile: '', // 임시 프로필 이름 저장
	tempPassword: '', // 임시 비밀번호 저장
	authenticated: false, // 인증 상태
	storedPassword: null, // Firebase에서 가져온 비밀번호
	firstTimeHelpShown: false, // 첫 번째 도움말 안내 표시 여부

	// 외부 파일에서 메시지 불러오기
	placeholders: commandConsoleMessages.placeholders,
	comments: commandConsoleMessages.comments,
	
	init() {
		this.output = document.getElementById('commandOutput');
		this.input = document.getElementById('commandInput');
		const sendBtn = document.getElementById('commandSendBtn');
		const toggleBtn = document.getElementById('toggleConsoleBtn');
		const consoleEl = document.getElementById('commandConsole');
		const roomKeyDisplay = document.getElementById('roomKeyDisplay');
		
		// key 파라미터가 있을 때 room key 설정 (콘솔은 표시하지 않음)
		currentRoomKey = getRoomKeyFromURL();
		if (currentRoomKey) {
			roomKeyDisplay.textContent = `Profile: ${currentRoomKey}`;
			// 인증 상태면 초록색 배경
			if (authenticatedPassword) {
				roomKeyDisplay.classList.add('authenticated');
			} else {
				roomKeyDisplay.classList.remove('authenticated');
			}
			
			// Firebase 초기화 시도
			if (initFirebase()) {
				syncEnabled = true;
				setupRealtimeSync();
			}
		}
		
		// 드래그 기능 추가 (dragState를 commandConsole에 저장)
		this.dragState = this.setupDragging(consoleEl);
		
		// 전역 ESC 키 이벤트 리스너 (비밀번호 모드 취소용)
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' || e.keyCode === 27) {
				// 비밀번호 입력 모드에서 ESC 키를 누르면 읽기 전용 모드로 전환
				if (this.inputMode === 'auth' || this.inputMode === 'auth-switch' || 
				    this.inputMode === 'password-change' || this.inputMode === 'delete-confirm' ||
				    this.inputMode === 'delete-password-confirm' || this.inputMode === 'password-delete-confirm' ||
				    this.inputMode === 'matching' || this.inputMode === 'input-data' || 
				    this.inputMode === 'profile-switch') {
					e.preventDefault();
					e.stopPropagation();
					this.log(this.comments.cancel);
					this.inputMode = 'normal';
					if (this.input) {
						this.input.type = 'text';
						this.input.value = '';
						this.input.placeholder = this.placeholders.input;
					}
					this.removeCancelButton();
					this.showFirstTimeHelp();
				}
			}
		});
		
		if (this.input) {
			this.input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.executeCommand();
				}
			});
		}
		
		if (sendBtn) {
			sendBtn.addEventListener('click', () => this.executeCommand());
		}
		
		// 콘솔 토글
		if (toggleBtn) {
			toggleBtn.addEventListener('click', () => {
				const content = document.querySelector('.command-content');
				const isHidden = content.style.display === 'none';
				
				if (isHidden) {
					// 펼치기: 저장된 위치와 크기 복원
					content.style.display = 'flex';
					consoleEl.style.width = this.savedPosition.width || '900px';
					consoleEl.style.height = this.savedPosition.height || '600px';
					consoleEl.style.transform = `translate(${this.savedPosition.x}px, ${this.savedPosition.y}px)`;
					this.dragState.xOffset = this.savedPosition.x;
					this.dragState.yOffset = this.savedPosition.y;
					toggleBtn.textContent = '?';
				} else {
					// 최소화: 현재 위치와 크기 저장 후 우측 하단으로 이동, 헤더만 표시
					this.savedPosition.x = this.dragState.xOffset;
					this.savedPosition.y = this.dragState.yOffset;
					this.savedPosition.width = consoleEl.style.width;
					this.savedPosition.height = consoleEl.style.height;
					content.style.display = 'none';
					consoleEl.style.width = '450px';
					consoleEl.style.height = 'auto';
					consoleEl.style.transform = 'translate(0, 0)';
					toggleBtn.textContent = '+';
				}
			});
		}
		
		// 콘솔 닫기
		const closeBtn = document.getElementById('closeConsoleBtn');
		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				consoleEl.style.display = 'none';
				
				// 상태 초기화 (다시 열었을 때 프로필 입력부터 시작)
				if (!currentRoomKey) {
					// 파라미터가 없는 경우에만 초기화
					this.inputMode = 'profile';
					this.input.type = 'text';
					this.input.placeholder = this.placeholders.profile;
					this.authenticated = false;
					this.storedPassword = null;
					this.tempProfile = '';
					this.tempPassword = '';
					
					// 출력 화면 클리어
					if (this.output) {
						this.output.innerHTML = '';
					}
				} else {
					// 프로필이 있는 경우
					// 비밀번호 입력 모드에서 닫으면 자동으로 읽기 모드로 전환
					if (this.inputMode === 'auth' || this.inputMode === 'auth-switch' || 
					    this.inputMode === 'password-change' || this.inputMode === 'delete-confirm' ||
					    this.inputMode === 'delete-password-confirm' || this.inputMode === 'password-delete-confirm' ||
					    this.inputMode === 'password-ask-initial' || this.inputMode === 'password-ask-switch' ||
					    this.inputMode === 'matching' || this.inputMode === 'input-data') {
						this.log(this.comments.cancel);
						this.inputMode = 'normal';
						
						// 확인 버튼이 표시되어 있다면 입력 필드로 복원
						this.restoreInputField();
						
						this.input.type = 'text';
						this.input.placeholder = this.placeholders.input;
					} else if (this.inputMode !== 'normal') {
						// 다른 특수 모드에서는 normal로 복귀
						this.inputMode = 'normal';
						this.input.type = 'text';
						this.input.placeholder = this.placeholders.input;
					}
				}
			});
		}
		
		// 리사이즈 기능 추가
		this.setupResizing(consoleEl);
	},

	setupResizing(consoleEl) {
		const handles = consoleEl.querySelectorAll('.resize-handle');
		if (!handles.length) return;
		
		let isResizing = false;
		let resizeDirection = '';
		let startX, startY, startWidth, startHeight;
		let startLeft, startTop;
		let finalLeft, finalTop, finalWidth, finalHeight;
		let originalTransform = '';
		let originalWidth, originalHeight;
		
		handles.forEach(handle => {
			handle.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				isResizing = true;
				startX = e.clientX;
				startY = e.clientY;
				
				originalTransform = consoleEl.style.transform || 'translate(0px, 0px)';
				originalWidth = parseInt(consoleEl.style.width) || 450;
				originalHeight = parseInt(consoleEl.style.height) || 350;
				
				const rect = consoleEl.getBoundingClientRect();
				startWidth = Math.round(rect.width);
				startHeight = Math.round(rect.height);
				startLeft = Math.round(rect.left);
				startTop = Math.round(rect.top);
				
				finalLeft = startLeft;
				finalTop = startTop;
				finalWidth = startWidth;
				finalHeight = startHeight;
				
				consoleEl.style.bottom = 'auto';
				consoleEl.style.right = 'auto';
				consoleEl.style.left = `${startLeft}px`;
				consoleEl.style.top = `${startTop}px`;
				consoleEl.style.transform = 'none';
				
				if (handle.classList.contains('resize-n')) resizeDirection = 'n';
				else if (handle.classList.contains('resize-s')) resizeDirection = 's';
				else if (handle.classList.contains('resize-e')) resizeDirection = 'e';
				else if (handle.classList.contains('resize-w')) resizeDirection = 'w';
				else if (handle.classList.contains('resize-ne')) resizeDirection = 'ne';
				else if (handle.classList.contains('resize-nw')) resizeDirection = 'nw';
				else if (handle.classList.contains('resize-se')) resizeDirection = 'se';
				else if (handle.classList.contains('resize-sw')) resizeDirection = 'sw';
				
				consoleEl.style.transition = 'none';
			});
		});
		
		document.addEventListener('mousemove', (e) => {
			if (!isResizing) return;
			
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;
			
			let newWidth = startWidth;
			let newHeight = startHeight;
			let newLeft = startLeft;
			let newTop = startTop;
			
			if (resizeDirection.includes('e')) {
				newWidth = Math.max(450, Math.min(startWidth + deltaX, window.innerWidth - startLeft - 20));
			}
			if (resizeDirection.includes('w')) {
				const maxWidth = startLeft + startWidth - 20;
				newWidth = Math.max(450, Math.min(startWidth - deltaX, maxWidth));
				newLeft = startLeft + (startWidth - newWidth);
			}
			if (resizeDirection.includes('s')) {
				newHeight = Math.max(350, Math.min(startHeight + deltaY, window.innerHeight - startTop - 20));
			}
			if (resizeDirection.includes('n')) {
				const maxHeight = startTop + startHeight - 20;
				newHeight = Math.max(350, Math.min(startHeight - deltaY, maxHeight));
				newTop = startTop + (startHeight - newHeight);
			}
			
			finalLeft = Math.round(newLeft) + 15;
			finalTop = Math.round(newTop);
			finalWidth = Math.round(newWidth);
			finalHeight = Math.round(newHeight);
			
			consoleEl.style.width = `${newWidth}px`;
			consoleEl.style.height = `${newHeight}px`;
			consoleEl.style.left = `${newLeft}px`;
			consoleEl.style.top = `${newTop}px`;
		});
		
		document.addEventListener('mouseup', () => {
			if (isResizing) {
				const widthChanged = finalWidth !== originalWidth;
				const heightChanged = finalHeight !== originalHeight;
				
				if (widthChanged || heightChanged) {
					const baseRight = window.innerWidth - finalWidth - 20;
					const baseBottom = window.innerHeight - finalHeight - 20;
					
					const newTransformX = finalLeft - baseRight;
					const newTransformY = finalTop - baseBottom;
					
					consoleEl.style.width = `${finalWidth}px`;
					consoleEl.style.height = `${finalHeight}px`;
					consoleEl.style.left = 'auto';
					consoleEl.style.top = 'auto';
					consoleEl.style.right = '20px';
					consoleEl.style.bottom = '20px';
					consoleEl.style.transform = `translate(${newTransformX}px, ${newTransformY}px)`;
					
					if (this.dragState) {
						this.dragState.xOffset = newTransformX;
						this.dragState.yOffset = newTransformY;
						this.dragState.currentX = newTransformX;
						this.dragState.currentY = newTransformY;
						this.dragState.initialX = 0;
						this.dragState.initialY = 0;
					}
					
					this.savedPosition.x = newTransformX;
					this.savedPosition.y = newTransformY;
				} else {
					consoleEl.style.left = 'auto';
					consoleEl.style.top = 'auto';
					consoleEl.style.right = '20px';
					consoleEl.style.bottom = '20px';
					consoleEl.style.transform = originalTransform;
				}
				
				isResizing = false;
				resizeDirection = '';
			}
		});
	},
	
	setupDragging(consoleEl) {
		const header = consoleEl.querySelector('.command-header');
		const content = consoleEl.querySelector('.command-content');
		if (!header) return { xOffset: 0, yOffset: 0 };
		
		const dragState = {
			isDragging: false,
			currentX: 0,
			currentY: 0,
			initialX: 0,
			initialY: 0,
			xOffset: 0,
			yOffset: 0
		};
		
		header.addEventListener('mousedown', (e) => {
			if (e.target.closest('.toggle-console-btn')) return;
			if (e.target.closest('.close-console-btn')) return;
			if (content && content.style.display === 'none') return;
			
			dragState.initialX = e.clientX - dragState.xOffset;
			dragState.initialY = e.clientY - dragState.yOffset;
			dragState.isDragging = true;
			consoleEl.style.transition = 'none';
		});
		
		document.addEventListener('mousemove', (e) => {
			if (!dragState.isDragging) return;
			
			e.preventDefault();
			dragState.currentX = e.clientX - dragState.initialX;
			dragState.currentY = e.clientY - dragState.initialY;
			
			const rect = consoleEl.getBoundingClientRect();
			const maxX = window.innerWidth - rect.width - 20;
			const maxY = window.innerHeight - rect.height - 20;
			const minX = 20;
			const minY = 20;
			
			dragState.xOffset = Math.max(minX - (window.innerWidth - rect.width - 20), Math.min(dragState.currentX, maxX - (window.innerWidth - rect.width - 20)));
			dragState.yOffset = Math.max(minY - (window.innerHeight - rect.height - 20), Math.min(dragState.currentY, maxY - (window.innerHeight - rect.height - 20)));
			
			setTranslate(dragState.xOffset, dragState.yOffset, consoleEl);
		});
		
		document.addEventListener('mouseup', () => {
			if (dragState.isDragging) {
				dragState.initialX = dragState.currentX;
				dragState.initialY = dragState.currentY;
				dragState.isDragging = false;
			}
		});
		
		function setTranslate(xPos, yPos, el) {
			el.style.transform = `translate(${xPos}px, ${yPos}px)`;
		}
		
		return dragState;
	},
	
	showConfirmButtons() {
		const container = document.querySelector('.command-input-container');
		if (!container) return;
		
		container.innerHTML = `
			<button id="commandConfirmBtn" class="command-confirm-btn">확인</button>
			<button id="commandCancelBtn" class="command-cancel-btn">취소</button>
		`;
		
		document.getElementById('commandConfirmBtn').addEventListener('click', () => {
			this.handleConfirmResponse(true);
		});
		
		document.getElementById('commandCancelBtn').addEventListener('click', () => {
			this.handleConfirmResponse(false);
		});
	},
	
	addCancelButton() {
		const container = document.querySelector('.command-input-container');
		if (!container) return;
		
		// 이미 취소 버튼이 있는지 확인
		if (document.getElementById('commandCancelBtn')) return;
		
		const cancelBtn = document.createElement('button');
		cancelBtn.id = 'commandCancelBtn';
		cancelBtn.className = 'command-send-btn';
		cancelBtn.textContent = '취소';
		cancelBtn.style.cssText = 'background: #ef4444; margin-left: 5px;';
		
		cancelBtn.addEventListener('click', () => {
			this.log(this.comments.cancel);
			this.inputMode = 'normal';
			if (this.input) {
				this.input.type = 'text';
				this.input.value = '';
				this.input.placeholder = this.placeholders.input;
			}
			this.removeCancelButton();
		});
		
		container.appendChild(cancelBtn);
	},
	
	removeCancelButton() {
		const cancelBtn = document.getElementById('commandCancelBtn');
		if (cancelBtn) {
			cancelBtn.remove();
		}
	},
	
	showFirstTimeHelp() {
		if (!this.firstTimeHelpShown) {
			this.log(this.comments.help);
			this.firstTimeHelpShown = true;
		}
	},
	
	restoreInputField(showCancelButton = false) {
		const container = document.querySelector('.command-input-container');
		if (!container) return;
		
		// 취소 버튼 제거
		this.removeCancelButton();
		// 프로필 입력 모드에서는 기본적으로 취소 버튼을 표시하도록 처리
		const showCancel = showCancelButton || this.inputMode === 'profile' || this.inputMode === 'profile-switch';
		
		const placeholderText = (this.inputMode === 'profile' || this.inputMode === 'profile-switch') ? this.placeholders.profile : this.placeholders.input;
		if (showCancel) {
			container.innerHTML = `
					<input type="text" id="commandInput" class="command-input" placeholder="${placeholderText}">
					<button id="commandSendBtn" class="command-send-btn">전송</button>
					<button id="commandCancelBtn" class="command-send-btn" style="background: #ef4444; margin-left: 5px;">취소</button>
				`;
		} else {
			container.innerHTML = `
					<input type="text" id="commandInput" class="command-input" placeholder="${placeholderText}">
					<button id="commandSendBtn" class="command-send-btn">전송</button>
				`;
		}
		
		this.input = document.getElementById('commandInput');
		const sendBtn = document.getElementById('commandSendBtn');
		const cancelBtn = document.getElementById('commandCancelBtn');
		
		if (this.input) {
			this.input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					this.executeCommand();
				}
			});
			// 입력 폼에 포커스
			setTimeout(() => this.input.focus(), 50);
		}
		
		if (sendBtn) {
			sendBtn.addEventListener('click', () => this.executeCommand());
		}
		
		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				this.log(this.comments.cancel);
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.value = '';
				this.input.placeholder = this.placeholders.input;
				this.restoreInputField(false);
			});
		}
	},

	handleConfirmResponse(confirmed) {
		if (this.inputMode === 'profile-create-confirm') {
			if (confirmed) {
				currentRoomKey = this.tempProfile;
				
				const url = new URL(window.location);
				url.searchParams.set('key', this.tempProfile);
				window.history.pushState({}, '', url);
				
				const roomKeyDisplay = document.getElementById('roomKeyDisplay');
				if (roomKeyDisplay) {
					roomKeyDisplay.textContent = `Profile: ${this.tempProfile}`;
					// 신규 생성 시에는 인증됨
					roomKeyDisplay.classList.add('authenticated');
				}
				
				this.success(`프로필 '${this.tempProfile}' 생성됨`);
				
				// 동기화 활성화
				if (!syncEnabled) {
					syncEnabled = true;
					setupRealtimeSync();
				}
				
				// 신규 프로필 생성 시 바로 빈 데이터로 초기화하여 동기화 시작
				const initialData = {
					people: state.people || [],
					inactivePeople: state.inactivePeople || [],
					requiredGroups: state.requiredGroups || [],
					nextId: state.nextId || 1,
					forbiddenPairs: state.forbiddenPairs || [],
					pendingConstraints: state.pendingConstraints || [],
					hiddenGroups: state.hiddenGroups || [],
					hiddenGroupChains: state.hiddenGroupChains || [],
					pendingHiddenGroups: state.pendingHiddenGroups || [],
					pendingHiddenGroupChains: state.pendingHiddenGroupChains || [],
					maxTeamSizeEnabled: state.maxTeamSizeEnabled || false,
					genderBalanceEnabled: state.genderBalanceEnabled || false,
					weightBalanceEnabled: state.weightBalanceEnabled || false,
					membersPerTeam: state.membersPerTeam || 4,
					password: '', // 비밀번호 없음
					timestamp: Date.now()
				};
				
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}`).set(initialData)
						.then(() => {
							this.success(this.comments.syncActivated);
							this.log(this.comments.passwordCreate);
							this.inputMode = 'password-ask';
							this.showConfirmButtons();
						})
						.catch((error) => {
							this.error(`초기화 실패: ${error.message}`);
							this.log(this.comments.passwordCreate);
							this.inputMode = 'password-ask';
							this.showConfirmButtons();
						});
				} else {
					this.log(this.comments.passwordCreate);
					this.inputMode = 'password-ask';
					this.showConfirmButtons();
				}
			} else {
				// 프로필 생성 취소: 현재 프로필 유지 또는 초기 모드로 돌아가기
				if (currentRoomKey) {
					// 이미 프로필이 있으면 현재 프로필 유지
					this.log(this.comments.profileCreateCanceled.replace('{currentRoomKey}', currentRoomKey));

					// 전환 취소 시 파라미터 없는(프로필 없음) 상태로 전환
					const url = new URL(window.location);
					url.searchParams.delete('key');
					window.history.pushState({}, '', url);

					currentRoomKey = '';

					// 전환을 취소하면 현재 프로필을 유지하고 명령어 입력 모드로 복귀
					this.inputMode = 'normal';
					this.restoreInputField();
					if (this.input) {
						this.input.type = 'text';
						this.input.placeholder = this.placeholders.input;
						this.input.focus && setTimeout(() => this.input.focus(), 50);
					}
				} else {
					// 프로필이 없으면 초기 상태로
					const url = new URL(window.location);
					url.searchParams.delete('key');
					window.history.pushState({}, '', url);
					
					const roomKeyDisplay = document.getElementById('roomKeyDisplay');
					if (roomKeyDisplay) {
						roomKeyDisplay.textContent = 'Profile: -';
						roomKeyDisplay.classList.remove('authenticated');
					}
					
					currentRoomKey = null;
					this.tempProfile = '';
					this.tempPassword = '';
					this.storedPassword = null;
					this.authenticated = false;
					this.log(this.comments.profileCreateCanceled);
					// 취소 시 명령어 입력 모드로 복귀
					this.inputMode = 'normal';
					this.restoreInputField();
					if (this.input) {
						this.input.type = 'text';
						this.input.placeholder = this.placeholders.input;
						setTimeout(() => this.input.focus(), 50);
					}
				}
			}
		} else if (this.inputMode === 'password-ask') {
			if (confirmed) {
				this.log(this.comments.passwordCreatePrompt);
				this.inputMode = 'password';
				this.restoreInputField();
				this.input.placeholder = this.placeholders.passwordCreate;
				this.input.type = 'password';
				this.addCancelButton();
				setTimeout(() => this.input.focus(), 50);
			} else {
				if (database && this.tempProfile) {
					database.ref(`rooms/${this.tempProfile}/password`).set('').then(() => {
						this.success(this.comments.passwordSkipSuccess);
					}).catch((error) => {
						this.error(`${this.comments.profileCreateFailed}: ${error.message}`);
					});
				}
				this.inputMode = 'normal';
				this.authenticated = true;
				this.restoreInputField();
				this.input.placeholder = this.placeholders.input;
			}
		} else if (this.inputMode === 'password-ask-switch') {
			// 프로필 전환 시 비밀번호 입력 확인
			if (confirmed) {
				this.log(this.comments.passwordInput);
				this.inputMode = 'auth-switch';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = this.placeholders.passwordInput;
				this.addCancelButton();
				setTimeout(() => this.input.focus(), 50);
			} else {
				// 비밀번호 입력 취소 - 읽기 전용 모드로 사용
				this.log(this.comments.readOnlyModeInfo);
				this.inputMode = 'normal';
				this.authenticated = false; // 인증되지 않음
				this.restoreInputField();
				this.input.placeholder = this.placeholders.input;
				this.showFirstTimeHelp();
			}
		} else if (this.inputMode === 'password-ask-initial') {
			// 초기 접속 시 비밀번호 입력 확인
			if (confirmed) {
				this.log(this.comments.passwordInput);
				this.inputMode = 'auth';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = this.placeholders.passwordInput;
				this.addCancelButton();
				setTimeout(() => this.input.focus(), 50);
			} else {
				// 비밀번호 입력 취소 - 읽기 전용 모드로 사용
				this.log(this.comments.passwordInputSkipped);
				this.inputMode = 'normal';
				this.authenticated = false; // 인증되지 않음
				this.restoreInputField();
				this.input.placeholder = this.placeholders.input;
				this.showFirstTimeHelp();
			}
		} else if (this.inputMode === 'delete-confirm') {
			// 비밀번호 없을 때 삭제 확인
			if (confirmed) {
				this.warn(this.comments.deleteConfirmQuestion);
				this.log(this.comments.deleteConfirm);
				this.inputMode = 'delete-final-confirm';
				this.restoreInputField();
				this.input.type = 'text';
				this.input.placeholder = this.placeholders.profile;
				setTimeout(() => this.input.focus(), 50);
			} else {
				this.log(this.comments.deleteCanceled);
				this.inputMode = 'normal';
				this.restoreInputField();
				this.input.placeholder = this.placeholders.input;
			}
		} else if (this.inputMode === 'password-delete-confirm') {
			// 비밀번호 삭제 확인
			if (confirmed) {
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}/password`).set('')
						.then(() => {
							this.success(this.comments.passwordDeleted);
							this.storedPassword = ''; // 저장된 비밀번호 초기화
						})
						.catch((error) => {
							this.error(this.comments.passwordDeleteFailed.replace('{error}', error.message));
						});
				}
				this.inputMode = 'normal';
				this.restoreInputField();
				this.input.type = 'text';
				this.input.placeholder = this.placeholders.input;
			} else {
				this.log(this.comments.passwordChangeCanceled);
				this.inputMode = 'password-change-new';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = this.placeholders.passwordChangeNew;
				setTimeout(() => this.input.focus(), 50);
			}
		}
	},
	
	log(message, type = 'info') {
		if (!this.output) return;
		const timestamp = new Date().toLocaleTimeString('ko-KR');
		const entry = document.createElement('div');
		entry.className = `command-log command-log-${type}`;
		
		entry.innerHTML = `<span class="log-time">[${timestamp}]</span><span class="log-content">${message}</span>`;
		this.output.appendChild(entry);
		this.output.scrollTop = this.output.scrollHeight;
		
		// <code> 태그에 클릭 이벤트 추가 (명령어 자동 입력)
		entry.querySelectorAll('code[data-cmd]').forEach(code => {
			code.style.cursor = 'pointer';
			code.addEventListener('click', (e) => {
				e.stopPropagation();
				const cmdText = code.getAttribute('data-cmd');
				if (this.input && cmdText) {
					// 모든 특수 모드를 해제하고 normal 모드로 전환
					this.inputMode = 'normal';
					this.input.type = 'text';
					this.input.placeholder = this.placeholders.input;
					this.removeCancelButton();
					
					// 명령어 자동 입력
					this.input.value = cmdText;
					this.input.focus();
				}
			});
		});
	},

	error(message) {
		this.log(message, 'error');
	},

	warn(message) {
		this.log(message, 'warn');
	},

	success(message) {
		this.log(message, 'success');
	},
	
	executeCommand() {
		if (!this.input) return;
		const cmd = this.input.value.trim();
		
		// password-change-new 모드에서는 빈 값도 처리해야 함 (비밀번호 삭제 기능)
		if (!cmd && this.inputMode !== 'password-change-new') return;
		
		// 비밀번호 관련 입력 모드에서는 로그 출력하지 않음
		if (this.inputMode !== 'auth' && 
		    this.inputMode !== 'auth-switch' && 
		    this.inputMode !== 'password' && 
		    this.inputMode !== 'password-confirm' && 
		    this.inputMode !== 'password-change' && 
		    this.inputMode !== 'password-change-confirm' && 
		    this.inputMode !== 'delete-password-confirm' &&
		    this.inputMode !== 'matching') {
			this.log(`> ${cmd}`, 'command');
		}
		this.input.value = '';
		
		if (this.inputMode === 'matching') {
			// 규칙 모드: 히든 그룹 명령어 처리
			this.log(`> ${cmd}`, 'command');
			
			// 규칙 제거 명령어 체크
			const isRemoveCommand = /^([^()!]+)\(!\)/.test(cmd);
			
			// input 명령어를 통해 처리
			this.inputCommand(cmd);
			
			// 결과 메시지 출력
			if (isRemoveCommand) {
				this.success('✅ 규칙 제거 완료');
			} else {
				this.success('✅ 규칙 추가 완료');
			}
			
			// 확인하기 안내
			this.log('확인하기 (명령어: <code data-cmd="확률">확률</code>)');
			
			// 규칙 모드 유지 (취소 또는 ESC로만 종료 가능)
			this.input.placeholder = this.placeholders.ruleInput;
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		if (this.inputMode === 'profile' || this.inputMode === 'profile-switch') {
			if (!database && !initFirebase()) {
				this.error(this.comments.firebaseInitFailed + '.');
				return;
			}
			
			// 현재 프로필과 동일한 이름을 입력한 경우
			if (cmd === currentRoomKey) {
				this.log(this.comments.profileKeepCurrent);
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = this.placeholders.input;
				return;
			}
			
			// 프로필 전체 데이터 확인 (password뿐만 아니라 다른 데이터도 체크)
			database.ref(`rooms/${cmd}`).once('value', (snapshot) => {
				const profileData = snapshot.val();
				const isProfileSwitch = this.inputMode === 'profile-switch';
				
				// 프로필이 존재하는지 확인 (password 또는 다른 데이터가 있으면 존재)
				if (profileData !== null) {
					const password = profileData.password || '';
					this.tempProfile = cmd;
					currentRoomKey = cmd;
					this.storedPassword = password;
					this.authenticated = false;
					authenticatedPassword = ''; // 프로필 전환 시 인증 초기화
					
					const url = new URL(window.location);
					url.searchParams.set('key', cmd);
					window.history.pushState({}, '', url);
					
					const roomKeyDisplay = document.getElementById('roomKeyDisplay');
					if (roomKeyDisplay) {
						roomKeyDisplay.textContent = `Profile: ${cmd}`;
						// 프로필 전환 시에는 항상 인증되지 않은 상태
						roomKeyDisplay.classList.remove('authenticated');
					}
					
					if (isProfileSwitch) {
						// 프로필 전환 모드: 비밀번호 없으면 바로 전환, 있으면 인증 요청
						if (password === '') {
							this.authenticated = true;
							this.inputMode = 'normal';
							this.input.type = 'text';
							this.input.placeholder = this.placeholders.input;
							
							if (!syncEnabled) {
								syncEnabled = true;
								setupRealtimeSync();
							}
							
							// 데이터 로드
							database.ref(`rooms/${currentRoomKey}`).once('value')
								.then((snapshot) => {
									const data = snapshot.val();
									if (data && (data.people || data.timestamp)) {
										// 저장된 데이터가 있으면 로드
										loadStateFromData(data);
										this.success(this.comments.profileSwitchSuccess.replace('{profile}', cmd));
									} else {
										// 데이터가 없으면 초기화
										clearState();
										this.success(this.comments.profileSwitchSuccess.replace('{profile}', cmd));
									}
								})
								.catch((error) => {
									this.error(this.comments.dataLoadFailed.replace('{error}', error.message));
								});
						} else {
							// 데이터 먼저 로드
							database.ref(`rooms/${currentRoomKey}`).once('value')
								.then((snapshot) => {
									const data = snapshot.val();
									if (data && (data.people || data.timestamp)) {
										loadStateFromData(data);
										this.log(this.comments.profileFoundMessage.replace('{profile}', cmd));
									} else {
										this.log(this.comments.profileFoundMessage.replace('{profile}', cmd));
									}
									this.log(this.comments.passwordInputAsk);
									this.inputMode = 'password-ask-switch';
									this.showConfirmButtons();
								})
								.catch((error) => {
									this.error(this.comments.dataLoadFailed.replace('{error}', error.message));
									this.log(this.comments.passwordInputAsk);
									this.inputMode = 'password-ask-switch';
									this.showConfirmButtons();
								});
						}
					} else {
						// 초기 접속 모드
						// 데이터 먼저 로드
						database.ref(`rooms/${currentRoomKey}`).once('value')
							.then((snapshot) => {
								const data = snapshot.val();
								if (data && (data.people || data.timestamp)) {
									loadStateFromData(data);
									this.log(this.comments.profileFoundMessage.replace('{profile}', cmd));
								} else {
									this.log(this.comments.profileFoundMessage.replace('{profile}', cmd));
								}
								this.success(this.comments.syncActivated);
								
								if (!syncEnabled) {
									syncEnabled = true;
									setupRealtimeSync();
								}
								
								this.log(this.comments.passwordAskInitial);
								this.inputMode = 'password-ask-initial';
								this.showConfirmButtons();
							})
							.catch((error) => {
								this.error(this.comments.dataLoadFailed.replace('{error}', error.message));
								this.log(this.comments.passwordAskInitial);
								this.inputMode = 'password-ask-initial';
								this.showConfirmButtons();
							});
					}
				} else {
					this.tempProfile = cmd;
					if (isProfileSwitch) {
						this.warn(this.comments.profileNotFoundSwitch.replace('{profile}', cmd));
					} else {
						this.warn(this.comments.profileNotFoundInitial.replace('{profile}', cmd));
					}
					this.log(this.comments.profileCreateNew.replace('{profile}', cmd));
					this.inputMode = 'profile-create-confirm';
					this.showConfirmButtons();
				}
			}).catch((error) => {
				this.error(this.comments.profileCheckFailed.replace('{error}', error.message));
			});
			return;
		}
		
		if (this.inputMode === 'auth' || this.inputMode === 'auth-switch') {
			const isSwitch = this.inputMode === 'auth-switch';
			
			if (cmd === this.storedPassword) {
				this.authenticated = true;
				authenticatedPassword = cmd; // 인증된 비밀번호 저장
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = this.placeholders.input;
				this.removeCancelButton();
				
				// 프로필 배경색 업데이트
				const roomKeyDisplay = document.getElementById('roomKeyDisplay');
				if (roomKeyDisplay) {
					roomKeyDisplay.classList.add('authenticated');
				}
				
				// 프로필 전환 모드든 초기 접속 모드든 데이터 로드
				database.ref(`rooms/${currentRoomKey}`).once('value')
					.then((snapshot) => {
						const data = snapshot.val();
						if (data && (data.people || data.timestamp)) {
							if (isSwitch) {
								this.success(`✅ '${this.tempProfile}' 프로필로 전환 성공!`);
							} else {
								this.success(this.comments.authSuccess);
								this.showFirstTimeHelp();
							}
						} else {
							// 데이터가 없으면 초기화
							clearState();
							if (isSwitch) {
								this.success(`✅ '${this.tempProfile}' 프로필로 전환 성공!`);
							} else {
								this.success(this.comments.authSuccess);
								this.showFirstTimeHelp();
							}
						}
					})
					.catch((error) => {
						this.error(this.comments.dataLoadFailed.replace('{error}', error.message));
					});
			} else {
				this.error(this.comments.passwordMismatch + '. 다시 시도해주세요.');
			}
			return;
		}
		
		if (this.inputMode === 'password') {
		// 첫 번째 비밀번호 입력
		this.tempPassword = cmd;
		this.log(this.comments.passwordInputConfirm);
		this.inputMode = 'password-confirm';
		this.input.placeholder = this.placeholders.passwordConfirm;
		this.input.value = '';
		// 취소 버튼 유지 (이미 있음)
		return;
	}
	
	if (this.inputMode === 'password-confirm') {
		// 두 번째 비밀번호 입력 및 확인
		if (cmd === this.tempPassword) {
			// 비밀번호 일치
			if (database && currentRoomKey) {
				database.ref(`rooms/${currentRoomKey}/password`).set(this.tempPassword)
					.then(() => {
					this.success(this.comments.passwordSet);
						this.authenticated = true;
						this.removeCancelButton();
						this.showFirstTimeHelp();
					})
					.catch((error) => {
						this.error(`비밀번호 설정 실패: ${error.message}`);
					});
			}
			this.inputMode = 'normal';
			this.input.type = 'text';
			this.input.placeholder = this.placeholders.input;
			this.tempPassword = '';
		} else {
			// 비밀번호 불일치
			this.error(this.comments.passwordMismatch);
			this.log(this.comments.passwordCreatePrompt);
			this.inputMode = 'password';
			this.input.placeholder = this.placeholders.passwordCreate;
			this.tempPassword = '';
		}
		return;
	}
		
	if (this.inputMode === 'password-change') {
		// 1단계: 현재 비밀번호 확인
		if (cmd === this.storedPassword) {
			this.success(this.comments.passwordConfirmed);
			this.removeCancelButton();
			this.log(this.comments.passwordChangeNew);
			this.inputMode = 'password-change-new';
			this.input.placeholder = this.placeholders.passwordChangeNew;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
		} else {
			this.error('현재 ' + this.comments.passwordMismatch.toLowerCase() + '. 다시 시도해주세요.');
			this.inputMode = 'normal';
			this.input.type = 'text';
			this.input.placeholder = this.placeholders.input;
			this.removeCancelButton();
		}
		return;
	}
	
	if (this.inputMode === 'password-change-new') {
		// 2단계: 새 비밀번호 입력
		if (!cmd || cmd.trim() === '') {
			// 빈 값이면 비밀번호 삭제 확인
			this.warn(this.comments.passwordDeleteConfirm);
			this.inputMode = 'password-delete-confirm';
			this.showConfirmButtons();
			return;
		}
		this.tempPassword = cmd;
		this.log(this.comments.passwordChangeConfirm);
		this.inputMode = 'password-change-confirm';
		this.input.placeholder = this.placeholders.passwordChangeConfirm;
		setTimeout(() => this.input.focus(), 50);
		return;
	}
	
	if (this.inputMode === 'password-change-confirm') {
		// 3단계: 새 비밀번호 확인
		if (cmd === this.tempPassword) {
			if (database && currentRoomKey) {
				database.ref(`rooms/${currentRoomKey}/password`).set(this.tempPassword)
					.then(() => {
						this.success(this.comments.passwordChanged);
						this.storedPassword = this.tempPassword; // 저장된 비밀번호 업데이트
						this.removeCancelButton();
					})
					.catch((error) => {
						this.error(`비밀번호 변경 실패: ${error.message}`);
					});
			}
			this.inputMode = 'normal';
			this.input.type = 'text';
			this.input.placeholder = this.placeholders.input;
			this.tempPassword = '';
		} else {
			this.error(this.comments.passwordInputConfirm);
			this.inputMode = 'password-change-new';
			this.input.placeholder = this.placeholders.passwordChangeNew;
			this.tempPassword = '';
			setTimeout(() => this.input.focus(), 50);
		}
		return;
	}
	
	if (this.inputMode === 'input-data') {
		// 참가자 데이터 입력 완료
		if (typeof addPerson === 'function' && elements.nameInput) {
			elements.nameInput.value = cmd;
			addPerson();
			this.success(`${this.comments.participantAddComplete} ${cmd}`);
		} else {
			this.error(this.comments.participantAddDisabled);
		}
		
		// 입력 모드 유지 (취소 또는 ESC로만 종료 가능)
		this.input.placeholder = this.placeholders.inputData;
		setTimeout(() => this.input.focus(), 50);
		return;
	}

	if (this.inputMode === 'delete-password-confirm') {
		// 삭제 전 비밀번호 확인
		if (cmd === this.storedPassword) {
			this.success(this.comments.profileDeleteConfirmFinal);
			this.log(this.comments.deleteConfirm);
			this.inputMode = 'delete-final-confirm';
			this.input.type = 'text';
			this.input.placeholder = this.placeholders.profile;
			setTimeout(() => this.input.focus(), 50);
		} else {
			this.error(this.comments.passwordMismatch + '. 삭제가 취소되었습니다.');
			this.inputMode = 'normal';
			this.input.type = 'text';
			this.input.placeholder = this.placeholders.input;
			this.removeCancelButton();
		}
		return;
	}
		
	if (this.inputMode === 'delete-final-confirm') {
		// 최종 확인: 프로필 이름 일치 확인
		if (cmd === currentRoomKey) {
			// Firebase에서 프로필 삭제
			database.ref(`rooms/${currentRoomKey}`).remove()
				.then(() => {
					this.success(`✅ ${this.comments.profileDeleted.replace('프로필이', `프로필 '${currentRoomKey}'가`).replace('삭제되었습니다', '완전히 삭제되었습니다')}`);
					this.log(this.comments.deleteRedirect);
					
					// 로컬 상태 초기화
					clearState();
					currentRoomKey = null;
					syncEnabled = false;
					
					// 2초 후 index.html로 리다이렉트
					setTimeout(() => {
						window.location.href = 'index.html';
					}, 2000);
				})
				.catch((error) => {
					this.error(`삭제 실패: ${error.message}`);
					this.inputMode = 'normal';
					this.input.placeholder = this.placeholders.input;
				});
		} else {
			this.error(this.comments.profileDeleteNameMismatch);
			this.inputMode = 'normal';
			this.input.placeholder = this.placeholders.input;
		}
		return;
	}
		
	if (!this.authenticated && currentRoomKey) {
		// 읽기 모드에서는 save와 입력 관련 명령어만 차단
		const [command] = cmd.split(' ');
		const writeCommands = ['save', '저장', 'input', '입력', 'clear', '초기화'];
		if (writeCommands.includes(command.toLowerCase())) {
			this.warn(this.comments.readOnlyModeWarning + '. ' + this.comments.authenticationNeeded);
			this.log(this.comments.loginRequired);
			return;
		}
	}
		
	const [command, ...args] = cmd.split(' ');
		
		switch (command.toLowerCase()) {
			case 'save':
			case '저장':
				this.saveCommand();
				break;
			case 'load':
			case '불러오기':
				this.loadCommand();
				break;
			case 'sync':
			case '동기화':
				this.syncCommand(args.join(' '));
				break;
			case 'clear':
			case '초기화':
				this.clearCommand();
				break;
			case 'status':
			case '상태':
				this.statusCommand();
				break;
			case 'login':
			case '로그인':
				// 로그인 명령어 - 비밀번호 입력 모드로 전환
				this.loginCommand();
				break;
			case 'logout':
			case '종료':
				// 로그아웃 명령어 - 쓰기 모드에서 읽기 모드로 전환
				this.logoutCommand();
				break;
			case 'password':
			case '비밀번호':
				// 비밀번호 변경 명령어
				this.passwordCommand(args.join(' '));
				break;
			case 'profile':
			case '프로필':
				this.profileCommand();
				break;
			case '참가자':
			case 'member':
				this.participantsCommand();
				break;
			case '미참가자':
			case 'people':
				this.nonParticipantsCommand();
				break;
			case '제약':
				this.constraintsCommand();
				break;
			case '히든':
			case '확률':
				this.hiddenCommand();
				break;
			case '규칙':
			case 'rule':
			case 'matching':
				this.matchingCommand(args.join(' '));
				break;
			case '생성':
			case 'generate':
				this.generateCommand();
				break;
			case 'input':
			case '입력':
				this.inputCommand(args.join(' '));
				break;
			case 'delete':
			case '삭제':
			case 'delete-profile':
			case '프로필삭제':
				this.deleteCommand();
				break;
			case 'help':
			case '도움':
				this.helpCommand();
				break;
			default:
			this.error(this.comments.unknownCommand);
		}
	},

	saveCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
	
		// 먼저 현재 password를 읽어옴
		database.ref(`rooms/${currentRoomKey}/password`).once('value')
		.then((snapshot) => {
			const currentPassword = snapshot.val();
			
			const data = {
				people: state.people,
				inactivePeople: state.inactivePeople,
				requiredGroups: state.requiredGroups,
				nextId: state.nextId,
				forbiddenPairs: state.forbiddenPairs,
				pendingConstraints: state.pendingConstraints,
				hiddenGroups: state.hiddenGroups,
				hiddenGroupChains: state.hiddenGroupChains,
				pendingHiddenGroups: state.pendingHiddenGroups,
				pendingHiddenGroupChains: state.pendingHiddenGroupChains,
				maxTeamSizeEnabled: state.maxTeamSizeEnabled,
				genderBalanceEnabled: state.genderBalanceEnabled,
				weightBalanceEnabled: state.weightBalanceEnabled,
				membersPerTeam: state.membersPerTeam,
				timestamp: Date.now()
			};
				
			// password가 존재하면 포함
			if (currentPassword !== null) {
				data.password = currentPassword;
			}
			
			return database.ref(`rooms/${currentRoomKey}`).set(data);
		})
		.then(() => {
			this.success(this.comments.saveComplete);
		})
		.catch((error) => {
			this.error(`저장 실패: ${error.message}`);
		});
	},
	
	loadCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const data = snapshot.val();
				if (data) {
					loadStateFromData(data);
					this.success(this.comments.loadComplete);
				} else {
					this.warn(this.comments.noSavedData + '.');
				}
			})
			.catch((error) => {
				this.error(`로드 실패: ${error.message}`);
			});
	},
	
	syncCommand(args) {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		// 세분화된 동기화 옵션 처리
		const option = args.toLowerCase().trim();
		
		// 옵션이 있는 경우
		if (option) {
			switch (option) {
				case 'rule':
				case '규칙':
					this.syncRuleCommand();
					return;
				case 'option':
				case '옵션':
					this.syncOptionCommand();
					return;
				case 'member':
				case '참가자':
					this.syncMemberCommand();
					return;
				case 'people':
				case '미참가자':
					this.syncPeopleCommand();
					return;
				case 'constraint':
				case '제약':
					this.syncConstraintCommand();
					return;
				default:
					// 잘못된 옵션
					this.error(`❌ 알 수 없는 동기화 옵션: "${args}"<br>사용 가능한 옵션: 규칙, 옵션, 참가자, 미참가자, 제약`);
					return;
			}
		} else {
			// 옵션이 없으면 전체 동기화
			this.syncAllCommand();
			return;
		}
	},
	
	// 전체 동기화 (기존 sync 명령어)
	syncAllCommand() {
		this.log(this.comments.saving);
		
		// 먼저 현재 상태를 저장
		database.ref(`rooms/${currentRoomKey}/password`).once('value')
			.then((snapshot) => {
				const currentPassword = snapshot.val();
				
				const data = {
					people: state.people,
					inactivePeople: state.inactivePeople,
					requiredGroups: state.requiredGroups,
					nextId: state.nextId,
					forbiddenPairs: state.forbiddenPairs,
					pendingConstraints: state.pendingConstraints,
					hiddenGroups: state.hiddenGroups,
					hiddenGroupChains: state.hiddenGroupChains,
					pendingHiddenGroups: state.pendingHiddenGroups,
					pendingHiddenGroupChains: state.pendingHiddenGroupChains,
					maxTeamSizeEnabled: state.maxTeamSizeEnabled,
					genderBalanceEnabled: state.genderBalanceEnabled,
					weightBalanceEnabled: state.weightBalanceEnabled,
					membersPerTeam: state.membersPerTeam,
					timestamp: Date.now()
				};
				
				// password가 존재하면 포함
				if (currentPassword !== null) {
					data.password = currentPassword;
				}
				
				return database.ref(`rooms/${currentRoomKey}`).set(data);
			})
			.then(() => {
					this.success(this.comments.saveComplete);
					this.log(this.comments.syncing);
				// 동기화 트리거를 Firebase에 기록하여 모든 창에 알림
				const syncTrigger = { timestamp: Date.now(), type: 'all' };
				
				// 자신이 발생시킨 트리거는 리스너에서 무시하도록 lastSyncTrigger 미리 업데이트
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 현재 창에서도 동기화 실행
				return database.ref(`rooms/${currentRoomKey}`).once('value');
			})
			.then((snapshot) => {
				const data = snapshot.val();
					if (data) {
						loadStateFromData(data);
						this.success(`✅ 동기화 요청완료`);
					} else {
					this.warn(this.comments.noSavedData + '.');
				}
			})
				.catch((error) => {
					this.error(`❌ 동기화 실패: ${error.message}`);
				});
	},
	
	// 규칙만 동기화
	syncRuleCommand() {
		// 인증 체크
		if (!authenticatedPassword) {
			this.error('❌ 인증이 필요합니다. <code data-cmd="login">login</code> 또는 <code data-cmd="로그인">로그인</code> 명령어로 먼저 로그인하세요.');
			return;
		}
		
		this.log('📊 규칙 동기화 중...');
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const existingData = snapshot.val() || {};
				
				// 규칙 관련 데이터만 업데이트
				const updates = {
					hiddenGroups: state.hiddenGroups,
					hiddenGroupChains: state.hiddenGroupChains,
					pendingHiddenGroups: state.pendingHiddenGroups,
					pendingHiddenGroupChains: state.pendingHiddenGroupChains,
					timestamp: Date.now()
				};
				
				return database.ref(`rooms/${currentRoomKey}`).update(updates);
			})
			.then(() => {
				const syncTrigger = { timestamp: Date.now(), type: 'rule' };
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 규칙 데이터만 다시 로드
				return Promise.all([
					database.ref(`rooms/${currentRoomKey}/hiddenGroups`).once('value'),
					database.ref(`rooms/${currentRoomKey}/hiddenGroupChains`).once('value'),
					database.ref(`rooms/${currentRoomKey}/pendingHiddenGroups`).once('value'),
					database.ref(`rooms/${currentRoomKey}/pendingHiddenGroupChains`).once('value')
				]);
			})
			.then(([hiddenGroupsSnap, hiddenGroupChainsSnap, pendingHiddenGroupsSnap, pendingHiddenGroupChainsSnap]) => {
				// 규칙 데이터만 state에 반영
				state.hiddenGroups = hiddenGroupsSnap.val() || [];
				state.hiddenGroupChains = hiddenGroupChainsSnap.val() || [];
				state.pendingHiddenGroups = pendingHiddenGroupsSnap.val() || [];
				state.pendingHiddenGroupChains = pendingHiddenGroupChainsSnap.val() || [];
				
				// UI 업데이트는 필요 없음 (규칙은 UI에 직접 표시되지 않음)
				this.success(this.comments.syncRuleComplete);
			})
			.catch((error) => {
				this.error(`❌ 규칙 동기화 실패: ${error.message}`);
			});
	},
	
	// 옵션만 동기화
	syncOptionCommand() {
		// 인증 체크
		if (!authenticatedPassword) {
			this.error('❌ 인증이 필요합니다. <code data-cmd="login">login</code> 또는 <code data-cmd="로그인">로그인</code> 명령어로 먼저 로그인하세요.');
			return;
		}
		
		this.log('⚙️ 옵션 동기화 중...');
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const existingData = snapshot.val() || {};
				
				// 옵션 관련 데이터만 업데이트
				const updates = {
					maxTeamSizeEnabled: state.maxTeamSizeEnabled,
					genderBalanceEnabled: state.genderBalanceEnabled,
					weightBalanceEnabled: state.weightBalanceEnabled,
					membersPerTeam: state.membersPerTeam,
					timestamp: Date.now()
				};
				
				return database.ref(`rooms/${currentRoomKey}`).update(updates);
			})
			.then(() => {
				const syncTrigger = { timestamp: Date.now(), type: 'option' };
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 옵션 데이터만 다시 로드
				return Promise.all([
					database.ref(`rooms/${currentRoomKey}/maxTeamSizeEnabled`).once('value'),
					database.ref(`rooms/${currentRoomKey}/genderBalanceEnabled`).once('value'),
					database.ref(`rooms/${currentRoomKey}/weightBalanceEnabled`).once('value'),
					database.ref(`rooms/${currentRoomKey}/membersPerTeam`).once('value')
				]);
			})
			.then(([maxTeamSizeSnap, genderBalanceSnap, weightBalanceSnap, membersPerTeamSnap]) => {
				// 옵션 데이터만 state에 반영
				state.maxTeamSizeEnabled = maxTeamSizeSnap.val() || false;
				state.genderBalanceEnabled = genderBalanceSnap.val() || false;
				state.weightBalanceEnabled = weightBalanceSnap.val() || false;
				state.membersPerTeam = membersPerTeamSnap.val() || 4;
				
				// UI 업데이트
				if (elements.maxTeamSizeCheckbox) elements.maxTeamSizeCheckbox.checked = state.maxTeamSizeEnabled;
				if (elements.genderBalanceCheckbox) elements.genderBalanceCheckbox.checked = state.genderBalanceEnabled;
				if (elements.weightBalanceCheckbox) elements.weightBalanceCheckbox.checked = state.weightBalanceEnabled;
				if (elements.teamSizeInput) elements.teamSizeInput.value = state.membersPerTeam;
				
				this.success(this.comments.syncOptionComplete);
			})
			.catch((error) => {
				this.error(`❌ 옵션 동기화 실패: ${error.message}`);
			});
	},
	
	// 참가자만 동기화
	syncMemberCommand() {
		this.log('👥 참가자 동기화 중...');
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const existingData = snapshot.val() || {};
				
				// 참가자 관련 데이터만 업데이트
				const updates = {
					people: state.people,
					nextId: state.nextId,
					timestamp: Date.now()
				};
				
				return database.ref(`rooms/${currentRoomKey}`).update(updates);
			})
			.then(() => {
				const syncTrigger = { timestamp: Date.now(), type: 'member' };
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 참가자 데이터만 다시 로드
				return Promise.all([
					database.ref(`rooms/${currentRoomKey}/people`).once('value'),
					database.ref(`rooms/${currentRoomKey}/nextId`).once('value')
				]);
			})
			.then(([peopleSnap, nextIdSnap]) => {
				// 참가자 데이터만 state에 반영
				state.people = peopleSnap.val() || [];
				state.nextId = nextIdSnap.val() || 1;
				
				// 금지 맵 재구성 및 UI 업데이트
				buildForbiddenMap();
				renderPeople();
				
				this.success(this.comments.syncMemberComplete);
			})
			.catch((error) => {
				this.error(`❌ 참가자 동기화 실패: ${error.message}`);
			});
	},
	
	// 미참가자만 동기화
	syncPeopleCommand() {
		this.log('👤 미참가자 동기화 중...');
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const existingData = snapshot.val() || {};
				
				// 미참가자 관련 데이터만 업데이트
				const updates = {
					inactivePeople: state.inactivePeople,
					timestamp: Date.now()
				};
				
				return database.ref(`rooms/${currentRoomKey}`).update(updates);
			})
			.then(() => {
				const syncTrigger = { timestamp: Date.now(), type: 'people' };
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 미참가자 데이터만 다시 로드
				return database.ref(`rooms/${currentRoomKey}/inactivePeople`).once('value');
			})
			.then((snapshot) => {
				// 미참가자 데이터만 state에 반영
				state.inactivePeople = snapshot.val() || [];
				
				// UI 업데이트
				renderPeople();
				
				this.success(this.comments.syncPeopleComplete);
			})
			.catch((error) => {
				this.error(`❌ 미참가자 동기화 실패: ${error.message}`);
			});
	},
	
	// 제약만 동기화
	syncConstraintCommand() {
		this.log('🔗 제약 동기화 중...');
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const existingData = snapshot.val() || {};
				
				// 제약 관련 데이터만 업데이트
				const updates = {
					requiredGroups: state.requiredGroups,
					forbiddenPairs: state.forbiddenPairs,
					pendingConstraints: state.pendingConstraints,
					timestamp: Date.now()
				};
				
				return database.ref(`rooms/${currentRoomKey}`).update(updates);
			})
			.then(() => {
				const syncTrigger = { timestamp: Date.now(), type: 'constraint' };
				if (typeof lastSyncTrigger !== 'undefined') {
					lastSyncTrigger = syncTrigger;
				}
				return database.ref(`rooms/${currentRoomKey}/syncTrigger`).set(syncTrigger);
			})
			.then(() => {
				// 제약 데이터만 다시 로드
				return Promise.all([
					database.ref(`rooms/${currentRoomKey}/requiredGroups`).once('value'),
					database.ref(`rooms/${currentRoomKey}/forbiddenPairs`).once('value'),
					database.ref(`rooms/${currentRoomKey}/pendingConstraints`).once('value')
				]);
			})
			.then(([requiredGroupsSnap, forbiddenPairsSnap, pendingConstraintsSnap]) => {
				// 제약 데이터만 state에 반영
				state.requiredGroups = requiredGroupsSnap.val() || [];
				state.forbiddenPairs = forbiddenPairsSnap.val() || [];
				state.pendingConstraints = pendingConstraintsSnap.val() || [];
				
				// 금지 맵 재구성 및 UI 업데이트
				buildForbiddenMap();
				renderPeople();
				
				this.success(this.comments.syncConstraintComplete);
			})
			.catch((error) => {
				this.error(`❌ 제약 동기화 실패: ${error.message}`);
			});
	},
	
	clearCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		if (confirm(this.comments.clearConfirmMessage)) {
			// 비밀번호 백업
			database.ref(`rooms/${currentRoomKey}/password`).once('value')
				.then((snapshot) => {
					const savedPassword = snapshot.val();
					
					// 초기화된 데이터 저장 (비밀번호는 유지)
					const emptyData = {
						people: [],
						inactivePeople: [],
						requiredGroups: [],
						nextId: 1,
						forbiddenPairs: [],
						pendingConstraints: [],
						hiddenGroups: [],
						hiddenGroupChains: [],
						pendingHiddenGroups: [],
						pendingHiddenGroupChains: [],
						maxTeamSizeEnabled: false,
						genderBalanceEnabled: false,
						weightBalanceEnabled: false,
						membersPerTeam: 4,
						password: savedPassword !== null ? savedPassword : '',
						timestamp: Date.now()
					};
					
					return database.ref(`rooms/${currentRoomKey}`).set(emptyData);
				})
				.then(() => {
					// 로컬 state 초기화
					clearState();
					this.success(this.comments.clearComplete);
				})
				.catch((error) => {
					this.error(`초기화 실패: ${error.message}`);
				});
		}
	},
	
	statusCommand() {
		this.log('=== 현재 상태 ===<br>Room Key: ' + (currentRoomKey || '없음') + '<br>Firebase: ' + (syncEnabled ? '활성화' : '비활성화') + '<br>참가자: ' + state.people.length + '명<br>미참가자: ' + state.inactivePeople.length + '명<br>제약: ' + state.forbiddenPairs.length + '개');
	},
	
	
	helpCommand() {
		this.log(this.comments.helpMessage);
	},

	
	profileCommand() {
		this.log(this.comments.profileSwitch);
		this.inputMode = 'profile-switch';
		this.input.placeholder = this.placeholders.profile;
		this.addCancelButton();
		setTimeout(() => this.input.focus(), 50);
	},

	passwordCommand(newPassword) {
		
		// 현재 비밀번호가 없는지 확인
		if (!this.storedPassword || this.storedPassword === '') {
			// 비밀번호가 없으면 바로 새 비밀번호 입력 모드로
			this.log(this.comments.passwordChangeNew);
			this.inputMode = 'password-change-new';
			this.input.type = 'password';
			this.input.placeholder = this.placeholders.passwordChangeNew;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		// 인자가 제공된 경우 - 비밀번호 변경 플로우 시작
		if (newPassword && newPassword.trim()) {
			this.warn(this.comments.passwordChangeInteractive);
			this.log(this.comments.passwordCurrent);
			this.inputMode = 'password-change';
			this.input.type = 'password';
			this.input.placeholder = this.placeholders.passwordInput;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
		} else {
			// 인자가 없으면 비밀번호 변경 모드로 전환
			this.log(this.comments.passwordCurrent);
			this.inputMode = 'password-change';
			this.input.type = 'password';
			this.input.placeholder = this.placeholders.passwordInput;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
		}
	},
	
	loginCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		if (this.authenticated) {
			this.log(this.comments.loginSuccess);
			return;
		}
		
		// 비밀번호 입력 모드로 전환
		this.log('🔒 비밀번호를 입력하세요:');
		this.inputMode = 'auth';
		this.input.type = 'password';
		this.input.placeholder = this.placeholders.passwordInput;
		this.addCancelButton();
		setTimeout(() => this.input.focus(), 50);
	},
	
	logoutCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		if (!this.authenticated) {
			this.log(this.comments.readonlyMode);
			return;
		}
		
		// 쓰기 모드에서 읽기 모드로 전환
		this.authenticated = false;
		authenticatedPassword = ''; // 인증 해제
		
		// 프로필 배경색 업데이트
		const roomKeyDisplay = document.getElementById('roomKeyDisplay');
		if (roomKeyDisplay) {
			roomKeyDisplay.classList.remove('authenticated');
		}
		
		this.success(this.comments.logoutSuccess);
		this.log(this.comments.loginInstructions);
	},
	
	participantsCommand() {
		if (state.people.length === 0) {
			this.log(this.comments.noParticipants + '.');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 📋 참가자 목록 (${state.people.length}명) ===</div>
			<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
				<thead>
					<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
						<th style="padding: 6px; text-align: center; width: 60px;">(index)</th>
						<th style="padding: 6px; text-align: left;">이름</th>
						<th style="padding: 6px; text-align: center; width: 60px;">성별</th>
						<th style="padding: 6px; text-align: center; width: 80px;">가중치</th>
						<th style="padding: 6px; text-align: left;">그룹</th>
					</tr>
				</thead>
				<tbody>`;
		
		state.people.forEach((person, index) => {
			const genderIcon = person.gender === 'male' ? '♂?' : person.gender === 'female' ? '♀?' : '?';
			const weight = person.weight || 0;
			const groups = state.requiredGroups
				.filter(group => group.includes(person.id))
				.map(group => {
					const otherIds = group.filter(id => id !== person.id);
					const otherNames = otherIds.map(id => {
						const p = state.people.find(per => per.id === id);
						return p ? p.name : '?';
					});
					return otherNames.join(', ');
				})
				.filter(g => g)
				.join(', ');
			
			const groupDisplay = groups ? `'${groups}'` : '';
			
			output += `
				<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
					<td style="padding: 6px; text-align: center; color: #94a3b8;">${index}</td>
					<td style="padding: 6px;">'${person.name}'</td>
					<td style="padding: 6px; text-align: center;">${genderIcon}</td>
					<td style="padding: 6px; text-align: center; color: ${weight > 0 ? '#a78bfa' : '#94a3b8'};">${weight}</td>
					<td style="padding: 6px; color: #6ee7b7;">${groupDisplay}</td>
				</tr>`;
		});
		
		output += `
				</tbody>
			</table>
		</div>`;
		
		this.log(output);
	},
	
	nonParticipantsCommand() {
		if (state.inactivePeople.length === 0) {
			this.log(this.comments.noInactiveParticipants + '.');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 🚫 미참가자 목록 (${state.inactivePeople.length}명) ===</div>
			<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
				<thead>
					<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
						<th style="padding: 6px; text-align: center; width: 60px;">(index)</th>
						<th style="padding: 6px; text-align: left;">이름</th>
						<th style="padding: 6px; text-align: center; width: 60px;">성별</th>
						<th style="padding: 6px; text-align: center; width: 80px;">가중치</th>
					</tr>
				</thead>
				<tbody>`;
		
		state.inactivePeople.forEach((person, index) => {
			const genderIcon = person.gender === 'male' ? '♂?' : person.gender === 'female' ? '♀?' : '?';
			const weight = person.weight || 0;
			
			output += `
				<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
					<td style="padding: 6px; text-align: center; color: #94a3b8;">${index}</td>
					<td style="padding: 6px;">'${person.name}'</td>
					<td style="padding: 6px; text-align: center;">${genderIcon}</td>
					<td style="padding: 6px; text-align: center; color: ${weight > 0 ? '#a78bfa' : '#94a3b8'};">${weight}</td>
				</tr>`;
		});
		
		output += `
				</tbody>
			</table>
		</div>`;
		
		this.log(output);
	},
	
	constraintsCommand() {
		const totalConstraints = state.forbiddenPairs.length + state.pendingConstraints.length;
		
		if (totalConstraints === 0) {
			this.log(this.comments.noConstraints);
			return;
		}
		
		let output = `=== ⚠️ 제약 조건 (${totalConstraints}개) ===<br><br>`;
		
		// 활성 제약 (forbiddenPairs)
		if (state.forbiddenPairs.length > 0) {
			output += `<strong>⚠️ 활성 제약 (${state.forbiddenPairs.length}개):</strong><br>`;
			state.forbiddenPairs.forEach((pair, index) => {
				const personA = state.people.find(p => p.id === pair[0]);
				const personB = state.people.find(p => p.id === pair[1]);
				if (personA && personB) {
					output += `${index + 1}. ${personA.name} ⛔ ${personB.name}<br>`;
				}
			});
			output += '<br>';
		}
		
		// 보류 제약 (pendingConstraints)
		if (state.pendingConstraints.length > 0) {
			output += `<strong>? 보류 제약 (${state.pendingConstraints.length}개):</strong><br>`;
			state.pendingConstraints.forEach((constraint, index) => {
				output += `${index + 1}. ${constraint.left} ⛔ ${constraint.right}<br>`;
			});
		}
		
		this.log(output);
	},
	
	matchingCommand(ruleInput) {
		if (!this.authenticated) {
			this.error(this.comments.ruleReadOnlyError);
			this.log(this.comments.authenticationRequired);
			return;
		}
		
		// 인자가 있으면 바로 규칙 등록
		if (ruleInput && ruleInput.trim()) {
			this.log(`> ${ruleInput}`, 'command');
			
			// 규칙 제거 명령어 체크
			const isRemoveCommand = /^([^()!]+)\(!\)/.test(ruleInput);
			
			// input 명령어를 통해 처리
			this.inputCommand(ruleInput);
			
			// 결과 메시지 출력
			if (isRemoveCommand) {
				this.success(this.comments.ruleRemoveSuccess);
			} else {
				this.success(this.comments.ruleAddSuccess);
			}
			
			// 확인하기 안내
			this.log(this.comments.matchingGroupsHelp);
			return;
		}
		
		// 인자가 없으면 입력 모드로 전환
		this.log(this.comments.matchingSetup);
		this.log(this.comments.matchingFormat);
		this.log(this.comments.probabilityExample);

		this.inputMode = 'matching';
		this.input.placeholder = this.placeholders.matchingRule;
		this.addCancelButton();
		setTimeout(() => this.input.focus(), 50);
	},
	
	generateCommand() {
		if (typeof shuffleTeams === 'function') {
			this.log(this.comments.teamGenerating);
			try {
				shuffleTeams();
				// shuffleTeams가 성공하면 cmd 콘솔에 결과가 출력됨
			} catch (error) {
				this.error(this.comments.teamGenerationFailed.replace('{error}', error.message));
			}
		} else {
			this.error(this.comments.shuffleFunctionMissing);
		}
	},
	
	hiddenCommand() {
		if (!this.authenticated) {
			this.error(this.comments.ruleReadOnlyError);
			this.log(this.comments.authenticationRequired);
			return;
		}
		
		const totalHidden = state.hiddenGroups.length + state.hiddenGroupChains.length + 
		                    state.pendingHiddenGroups.length + state.pendingHiddenGroupChains.length;
		
		if (totalHidden === 0) {
			this.log(this.comments.noProbabilityRules);
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">📊 ${this.comments.probabilityRules} (${this.comments.ruleSetup} : <code data-cmd="규칙">규칙</code>)</div>`;
		
		// 확률 기반 그룹 (hiddenGroups)
		if (state.hiddenGroups.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">📊 ${this.comments.probabilityRules} (${state.hiddenGroups.length}개):</div>
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">${this.comments.memberA}</th>
							<th style="padding: 6px; text-align: left;">${this.comments.memberB}</th>
							<th style="padding: 6px; text-align: center; width: 80px;">${this.comments.probability}</th>
						</tr>
					</thead>
					<tbody>`;
			
			state.hiddenGroups.forEach((group) => {
				const personA = state.people.find(p => p.id === group[0]);
				const personB = state.people.find(p => p.id === group[1]);
				const probability = group[2];
				
				if (personA && personB) {
					// probability가 1보다 크면 이미 퍼센트 값, 아니면 0~1 범위
					const displayPercent = probability > 1 ? Math.round(probability) : Math.round(probability * 100);
					output += `
						<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
							<td style="padding: 6px;">'${personA.name}'</td>
							<td style="padding: 6px;">'${personB.name}'</td>
							<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
						</tr>`;
				}
			});
			
			output += `
					</tbody>
				</table>
			</div>`;
		}
		
		// 확률 규칙 체인 (hiddenGroupChains) - rowspan 사용
		if (state.hiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">${this.comments.memberA}</th>
							<th style="padding: 6px; text-align: left;">${this.comments.memberB}</th>
							<th style="padding: 6px; text-align: center; width: 80px;">${this.comments.probability}</th>
						</tr>
					</thead>
					<tbody>`;
			
			state.hiddenGroupChains.forEach((chain) => {
				// 이름 기반으로 참가자 찾기
				const primaryPerson = state.people.find(p => p.name === chain.primary);
				const candidates = chain.candidates || [];
				
				// primary가 참가자 목록에 없어도 규칙은 표시
				const primaryName = primaryPerson ? primaryPerson.name : chain.primary;
				const primaryDisplay = primaryPerson ? `'${primaryName}'` : `<span style="color: #94a3b8;">'${primaryName}'</span>`;
				
				if (candidates.length > 0) {
					candidates.forEach((candidate, idx) => {
						// 이름 기반으로 후보 찾기
						const candidatePerson = state.people.find(p => p.name === candidate.name);
						const candidateName = candidatePerson ? candidatePerson.name : candidate.name;
						const candidateDisplay = candidatePerson ? `'${candidateName}'` : `<span style="color: #94a3b8;">'${candidateName}'</span>`;
						
						// probability는 이미 퍼센트 값
						const displayPercent = Math.round(candidate.probability);
						if (idx === 0) {
							// 첫 번째 행: primary 표시
							output += `
								<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
									<td style="padding: 6px;">${primaryDisplay}</td>
									<td style="padding: 6px;">${candidateDisplay}</td>
									<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
								</tr>`;
						} else {
							// 나머지 행: 멤버 A는 공백
							output += `
								<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
									<td style="padding: 6px;"></td>
									<td style="padding: 6px;">${candidateDisplay}</td>
									<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
								</tr>`;
						}
					});
				}
			});
			
			output += `
					</tbody>
				</table>
			</div>`;
		}
		
		// 보류 확률 규칙 (pendingHiddenGroups)
		if (state.pendingHiddenGroups.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">? 보류 확률 규칙 (${state.pendingHiddenGroups.length}개):</div>`;
			state.pendingHiddenGroups.forEach((group, index) => {
				output += `<div style="padding: 4px 0;">${index + 1}. ${group.left} ↔ ${group.right} (${Math.round(group.probability * 100)}%)</div>`;
			});
			output += `</div>`;
		}
		
		// 보류 확률 기반 그룹 체인 (pendingHiddenGroupChains)
		if (state.pendingHiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">${this.comments.memberA}</th>
							<th style="padding: 6px; text-align: left;">${this.comments.memberB}</th>
							<th style="padding: 6px; text-align: center; width: 80px;">${this.comments.probability}</th>
						</tr>
					</thead>
					<tbody>`;
			
			state.pendingHiddenGroupChains.forEach((chain) => {
				const candidates = chain.candidates || [];
				
				if (candidates.length > 0) {
					candidates.forEach((candidate, idx) => {
						const displayPercent = candidate.probability > 1 ? Math.round(candidate.probability) : Math.round(candidate.probability * 100);
						if (idx === 0) {
							// 첫 번째 행: primary 표시
							output += `
								<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
									<td style="padding: 6px;">'${chain.primary}'</td>
									<td style="padding: 6px;">'${candidate.name}'</td>
									<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
								</tr>`;
						} else {
							// 나머지 행: 멤버 A는 공백
							output += `
								<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
									<td style="padding: 6px;"></td>
									<td style="padding: 6px;">'${candidate.name}'</td>
									<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
								</tr>`;
						}
					});
				}
			});
			
			output += `
					</tbody>
				</table>
			</div>`;
		}
		
		output += `</div>`;
		
		this.log(output);
	},
	
	inputCommand(data) {
		// 참가자 추가 폼에 입력하는 것과 동일하게 처리
		if (!data || data.trim() === '') {
			// 데이터가 없으면 입력 모드로 전환
			this.log(this.comments.inputDataPrompt);
			this.inputMode = 'input-data';
			this.input.placeholder = this.placeholders.participantData;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		// nameInput에 값을 설정하고 addPerson 함수 호출
		if (typeof addPerson === 'function' && elements.nameInput) {
			const originalValue = elements.nameInput.value;
			elements.nameInput.value = data;
			
			// addPerson 함수 실행 (fromConsole=true 전달)
			addPerson(true);
			
			this.success(`${this.comments.participantAddComplete} ${data}`);
		} else {
			this.error(this.comments.participantAddDisabled);
		}
	},
	
	deleteCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.error(this.comments.firebaseMissing);
			return;
		}
		
		if (!this.authenticated) {
			this.error(this.comments.deleteReadOnlyError);
			this.log(this.comments.authenticationRequired);
			return;
		}
		
		this.warn(this.comments.profileDeleteAttemptMessage.replace('{profile}', currentRoomKey));
		this.warn(this.comments.deleteWarning);
		
		// 비밀번호가 있는지 확인
		if (this.storedPassword && this.storedPassword !== '') {
			// 비밀번호가 있으면 비밀번호 입력 모드
			this.log(this.comments.passwordConfirmPrompt);
			this.inputMode = 'delete-password-confirm';
			this.input.type = 'password';
			this.input.placeholder = this.placeholders.passwordInput;
			this.addCancelButton();
			setTimeout(() => this.input.focus(), 50);
		} else {
			// 비밀번호가 없으면 확인/취소 버튼 표시
			// this.warn('삭제하시겠습니까?');
			this.inputMode = 'delete-confirm';
			this.showConfirmButtons();
		}
	}
};

console = commandConsole;