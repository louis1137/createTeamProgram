// ==================== 명령어 콘솔 ====================

const commandConsole = {
	output: null,
	input: null,
	savedPosition: { x: 0, y: 0, width: '450px', height: '350px' }, // 최소화 전 위치와 크기 저장
	dragState: null, // 드래그 상태 저장
	inputMode: 'normal', // 입력 모드: 'normal', 'auth', 'profile', 'password', 'password-confirm', 'password-ask'
	tempProfile: '', // 임시 프로필 이름 저장
	tempPassword: '', // 임시 비밀번호 저장
	authenticated: false, // 인증 상태
	storedPassword: null, // Firebase에서 가져온 비밀번호
	
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
			
			// Firebase 초기화 시도
			if (initFirebase()) {
				syncEnabled = true;
				setupRealtimeSync();
			}
		}
		
		// 드래그 기능 추가 (dragState를 commandConsole에 저장)
		this.dragState = this.setupDragging(consoleEl);
		
		// 엔터키로 명령어 전송
		if (this.input) {
			this.input.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
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
					consoleEl.style.width = this.savedPosition.width || '450px';
					consoleEl.style.height = this.savedPosition.height || '350px';
					consoleEl.style.transform = `translate(${this.savedPosition.x}px, ${this.savedPosition.y}px)`;
					this.dragState.xOffset = this.savedPosition.x;
					this.dragState.yOffset = this.savedPosition.y;
					toggleBtn.textContent = '−';
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
					this.input.placeholder = '프로필 이름 입력...';
					this.authenticated = false;
					this.storedPassword = null;
					this.tempProfile = '';
					this.tempPassword = '';
					
					// 출력 화면 클리어
					if (this.output) {
						this.output.innerHTML = '';
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
	
	restoreInputField() {
		const container = document.querySelector('.command-input-container');
		if (!container) return;
		
		container.innerHTML = `
			<input type="text" id="commandInput" class="command-input" placeholder="명령어를 입력하세요... (예: save, load, clear)">
			<button id="commandSendBtn" class="command-send-btn">전송</button>
		`;
		
		this.input = document.getElementById('commandInput');
		const sendBtn = document.getElementById('commandSendBtn');
		
		if (this.input) {
			this.input.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					this.executeCommand();
				}
			});
			// 입력 폼에 포커스
			setTimeout(() => this.input.focus(), 50);
		}
		
		if (sendBtn) {
			sendBtn.addEventListener('click', () => this.executeCommand());
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
				}
				
				this.log(`프로필 '${this.tempProfile}' 생성됨`, 'success');
				this.log('비밀번호를 생성하시겠습니까?', 'info');
				
				this.inputMode = 'password-ask';
				this.showConfirmButtons();
				
				if (!syncEnabled) {
					syncEnabled = true;
					setupRealtimeSync();
				}
			} else {
				// 프로필 생성 취소: 현재 프로필 유지 또는 초기 모드로 돌아가기
				if (currentRoomKey) {
					// 이미 프로필이 있으면 현재 프로필 유지
					this.log(`'전환이 취소되었습니다. 현재 프로필: ${currentRoomKey}`, 'info');
					this.inputMode = 'normal';
					this.restoreInputField();
					this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
				} else {
					// 프로필이 없으면 초기 상태로
					const url = new URL(window.location);
					url.searchParams.delete('key');
					window.history.pushState({}, '', url);
					
					const roomKeyDisplay = document.getElementById('roomKeyDisplay');
					if (roomKeyDisplay) {
						roomKeyDisplay.textContent = 'Profile: -';
					}
					
					currentRoomKey = null;
					this.log('프로필 생성이 취소되었습니다.<br>프로필 이름을 입력하세요:', 'info');
					this.inputMode = 'profile';
					this.restoreInputField();
					this.input.placeholder = '프로필 이름 입력...';
				}
			}
		} else if (this.inputMode === 'password-ask') {
			if (confirmed) {
				this.log('비밀번호를 생성하세요:', 'info');
				this.inputMode = 'password';
				this.restoreInputField();
				this.input.placeholder = '비밀번호를 생성하세요...';
				this.input.type = 'password';
				setTimeout(() => this.input.focus(), 50);
			} else {
				if (database && this.tempProfile) {
					database.ref(`rooms/${this.tempProfile}/password`).set('').then(() => {
						this.log('비밀번호 설정을 건너뛰었습니다.<br>프로필이 생성되었습니다.<br>콘솔이 준비되었습니다.', 'success');
					}).catch((error) => {
						this.log(`프로필 생성 실패: ${error.message}`, 'error');
					});
				}
				this.inputMode = 'normal';
				this.authenticated = true;
				this.restoreInputField();
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
		}
	},
	
	log(message, type = 'info') {
		if (!this.output) return;
		const timestamp = new Date().toLocaleTimeString('ko-KR');
		const entry = document.createElement('div');
		entry.className = `command-log command-log-${type}`;
		
		const icon = {
			info: 'ℹ️',
			success: '✅',
			error: '❌',
			warning: '⚠️',
			command: '💬'
		}[type] || 'ℹ️';
		
		entry.innerHTML = `<span class="log-time">[${timestamp}]</span><span class="log-content">${icon} ${message}</span>`;
		this.output.appendChild(entry);
		this.output.scrollTop = this.output.scrollHeight;
	},
	
	executeCommand() {
		if (!this.input) return;
		const cmd = this.input.value.trim();
		if (!cmd) return;
		
		// 비밀번호 관련 입력 모드에서는 로그 출력하지 않음
		if (this.inputMode !== 'auth' && 
		    this.inputMode !== 'auth-switch' && 
		    this.inputMode !== 'password' && 
		    this.inputMode !== 'password-confirm' && 
		    this.inputMode !== 'password-change' && 
		    this.inputMode !== 'password-change-confirm') {
			this.log(`> ${cmd}`, 'command');
		}
		this.input.value = '';
		
		if (this.inputMode === 'profile' || this.inputMode === 'profile-switch') {
			if (!database && !initFirebase()) {
				this.log('Firebase 초기화에 실패했습니다.', 'error');
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
					
					const url = new URL(window.location);
					url.searchParams.set('key', cmd);
					window.history.pushState({}, '', url);
					
					const roomKeyDisplay = document.getElementById('roomKeyDisplay');
					if (roomKeyDisplay) {
						roomKeyDisplay.textContent = `Profile: ${cmd}`;
					}
					
					if (isProfileSwitch) {
						// 프로필 전환 모드: 비밀번호 없으면 바로 전환, 있으면 인증 요청
						if (password === '') {
							this.authenticated = true;
							this.inputMode = 'normal';
							this.input.type = 'text';
							this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
							
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
										this.log(`✅ '${cmd}' 프로필로 전환 성공! (참가자: ${state.people.length}명)`, 'success');
									} else {
										// 데이터가 없으면 초기화
										clearState();
										this.log(`✅ '${cmd}' 프로필로 전환 성공! (초기 상태)`, 'success');
									}
								})
								.catch((error) => {
									this.log(`데이터 로드 실패: ${error.message}`, 'error');
								});
						} else {
							this.log(`📡 프로필 '${cmd}' 발견<br>🔒 비밀번호를 입력하세요:`, 'info');
							this.inputMode = 'auth-switch';
							this.input.type = 'password';
							this.input.placeholder = '비밀번호 입력...';
							setTimeout(() => this.input.focus(), 50);
							
							if (!syncEnabled) {
								syncEnabled = true;
								setupRealtimeSync();
							}
						}
					} else {
						// 초기 접속 모드
						this.log(`📡 프로필 '${cmd}' 발견<br>🔒 비밀번호를 입력하세요:`, 'info');
						this.inputMode = 'auth-switch';
						this.input.type = 'password';
						this.input.placeholder = '비밀번호 입력...';
						setTimeout(() => this.input.focus(), 50);
						
						if (!syncEnabled) {
							syncEnabled = true;
							setupRealtimeSync();
						}
					}
				} else {
					this.tempProfile = cmd;
					if (isProfileSwitch) {
						this.log(`⚠️ '${cmd}'는 존재하지 않는 프로필입니다.<br>신규 프로필로 생성하시겠습니까?`, 'warning');
					} else {
						this.log(`⚠️ '${cmd}'는 존재하지 않는 프로필입니다.<br>신규 프로필로 등록하시겠습니까?`, 'warning');
					}
					this.inputMode = 'profile-create-confirm';
					this.showConfirmButtons();
				}
			}).catch((error) => {
				this.log(`프로필 확인 실패: ${error.message}`, 'error');
			});
			return;
		}
		
		if (this.inputMode === 'auth' || this.inputMode === 'auth-switch') {
			const isSwitch = this.inputMode === 'auth-switch';
			
			if (cmd === this.storedPassword) {
				this.authenticated = true;
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
				
				// 프로필 전환 모드든 초기 접속 모드든 데이터 로드
				database.ref(`rooms/${currentRoomKey}`).once('value')
					.then((snapshot) => {
						const data = snapshot.val();
						if (data && (data.people || data.timestamp)) {
							// 저장된 데이터가 있으면 로드
							loadStateFromData(data);
							if (isSwitch) {
								this.log(`✅ '${this.tempProfile}' 프로필로 전환 성공! (참가자: ${state.people.length}명)`, 'success');
							} else {
								this.log(`✅ 인증 성공! (참가자: ${state.people.length}명)<br>🔄 실시간 동기화 활성화됨<br>콘솔이 준비되었습니다.`, 'success');
							}
						} else {
							// 데이터가 없으면 초기화
							clearState();
							if (isSwitch) {
								this.log(`✅ '${this.tempProfile}' 프로필로 전환 성공! (초기 상태)`, 'success');
							} else {
								this.log('✅ 인증 성공! (초기 상태)<br>🔄 실시간 동기화 활성화됨<br>콘솔이 준비되었습니다.', 'success');
							}
						}
					})
					.catch((error) => {
						this.log(`데이터 로드 실패: ${error.message}`, 'error');
					});
			} else {
				this.log('비밀번호가 일치하지 않습니다. 다시 시도해주세요.', 'error');
			}
			return;
		}
		
		if (this.inputMode === 'password') {
			this.tempPassword = cmd;
			this.log('비밀번호를 다시 한번 입력해주세요:', 'info');
			this.inputMode = 'password-confirm';
			this.input.placeholder = '비밀번호를 다시 한번 입력해주세요...';
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		if (this.inputMode === 'password-confirm') {
			if (cmd === this.tempPassword) {
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}/password`).set(this.tempPassword)
						.then(() => {
						this.log('✅ 비밀번호가 설정되었습니다.<br>콘솔이 준비되었습니다.', 'success');
							this.authenticated = true;
						})
						.catch((error) => {
							this.log(`비밀번호 설정 실패: ${error.message}`, 'error');
						});
				}
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
				this.tempPassword = '';
			} else {
			this.log('비밀번호가 일치하지 않습니다. 다시 시도해주세요.<br>비밀번호를 생성하세요:', 'error');
				this.inputMode = 'password';
				this.input.placeholder = '비밀번호를 생성하세요...';
				this.tempPassword = '';
				setTimeout(() => this.input.focus(), 50);
			}
			return;
		}
		
		if (this.inputMode === 'password-change') {
			this.tempPassword = cmd;
			this.log('새 비밀번호를 다시 한번 입력해주세요:', 'info');
			this.inputMode = 'password-change-confirm';
			this.input.placeholder = '비밀번호 확인...';
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		if (this.inputMode === 'password-change-confirm') {
			if (cmd === this.tempPassword) {
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}/password`).set(this.tempPassword)
						.then(() => {
							this.log('🔑 비밀번호가 변경되었습니다.', 'success');
						})
						.catch((error) => {
							this.log(`비밀번호 변경 실패: ${error.message}`, 'error');
						});
				}
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
				this.tempPassword = '';
			} else {
				this.log('비밀번호가 일치하지 않습니다. 다시 시도해주세요.<br>새 비밀번호를 입력하세요:', 'error');
				this.inputMode = 'password-change';
				this.input.placeholder = '새 비밀번호 입력...';
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
				this.log(`참가자 추가 처리 완료: ${cmd}`, 'success');
			} else {
				this.log('참가자 추가 기능을 사용할 수 없습니다.', 'error');
			}
			
			this.inputMode = 'normal';
			this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			return;
		}
		
		if (!this.authenticated && currentRoomKey) {
			this.log('인증이 필요합니다. 콘솔을 닫고 다시 열어서 비밀번호를 입력하세요.', 'error');
			return;
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
			case 'clear':
			case '초기화':
				this.clearCommand();
				break;
			case 'status':
			case '상태':
				this.statusCommand();
				break;
			case 'password':
			case '비밀번호':
				this.passwordCommand(args.join(' '));
				break;
			case 'profile':
			case '프로필':
				this.profileCommand();
				break;
			case '참가자':
				this.participantsCommand();
				break;
			case '미참가자':
				this.nonParticipantsCommand();
				break;
			case '제약':
				this.constraintsCommand();
				break;
			case '히든':
				this.hiddenCommand();
				break;
			case 'input':
			case '입력':
				this.inputCommand(args.join(' '));
				break;
			case 'help':
			case '도움':
				this.helpCommand();
				break;
			default:
				this.log(`알 수 없는 명령어: ${command}. 'help' 또는 '도움'을 입력하여 도움말을 확인하세요.`, 'error');
		}
	},
	
	saveCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
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
				this.log(`💾 저장 완료! (참가자: ${state.people.length}명)`, 'success');
			})
			.catch((error) => {
				this.log(`저장 실패: ${error.message}`, 'error');
			});
	},
	
	loadCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		database.ref(`rooms/${currentRoomKey}`).once('value')
			.then((snapshot) => {
				const data = snapshot.val();
				if (data) {
					loadStateFromData(data);
					this.log(`📥 데이터 로드 완료! (참가자: ${state.people.length}명)`, 'success');
				} else {
					this.log('저장된 데이터가 없습니다.', 'warning');
				}
			})
			.catch((error) => {
				this.log(`로드 실패: ${error.message}`, 'error');
			});
	},
	
	clearCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		if (confirm('⚠️ 서버의 모든 데이터를 삭제하시겠습니까?')) {
			database.ref(`rooms/${currentRoomKey}`).remove()
				.then(() => {
					this.log('🗑️ 서버 데이터 삭제 완료', 'success');
				})
				.catch((error) => {
					this.log(`삭제 실패: ${error.message}`, 'error');
				});
		}
	},
	
	statusCommand() {
		this.log('=== 현재 상태 ===<br>Room Key: ' + (currentRoomKey || '없음') + '<br>Firebase: ' + (syncEnabled ? '활성화' : '비활성화') + '<br>참가자: ' + state.people.length + '명<br>미참가자: ' + state.inactivePeople.length + '명<br>제약: ' + state.forbiddenPairs.length + '개', 'info');
	},
	
	helpCommand() {
		this.log('=== 📋 명령어 도움말 ===<br><br>💾 save / 저장<br>   현재 참가자, 미참가자, 제약 조건, 설정 등 모든 상태를 서버에 저장합니다.<br>   동일한 Room Key로 접속한 다른 사용자들과 실시간으로 공유됩니다.<br><br>📥 load / 불러오기<br>   서버에 저장된 데이터를 불러옵니다.<br>   최신 저장 상태로 복원되며, 화면이 자동으로 업데이트됩니다.<br><br>🗑️ clear / 초기화<br>   서버에 저장된 현재 Room의 모든 데이터를 삭제합니다.<br>   ⚠️ 삭제된 데이터는 복구할 수 없으니 주의하세요!<br><br>📊 status / 상태<br>   현재 Room Key, Firebase 연결 상태, 참가자 수, 미참가자 수,<br>   제약 조건 개수 등 현재 상태를 확인합니다.<br><br>🔑 password / 비밀번호 [새 비밀번호]<br>   현재 프로필의 비밀번호를 변경합니다.<br>   새 비밀번호를 입력하지 않으면 입력 모드로 전환됩니다.<br>   입력 모드에서는 비밀번호를 두 번 입력하여 확인합니다.<br><br>👤 profile / 프로필<br>   다른 프로필로 전환합니다.<br>   프로필 이름을 입력하면 해당 프로필로 전환하고 데이터를 불러옵니다.<br>   존재하지 않는 프로필이면 생성 여부를 묻습니다.<br><br>✏️ input / 입력 [참가자 데이터]<br>   참가자 추가 폼과 동일한 방식으로 참가자를 추가합니다.<br>   예시: 입력 홍길동,김철수 / 이영희(남)50 / A!B / C(80)D<br>   쉼표로 그룹 구분, / 로 토큰 구분, ! 로 제약, () 로 확률/가중치 설정<br><br>👥 참가자<br>   현재 등록된 모든 참가자 목록을 표시합니다.<br>   각 참가자의 이름, 성별, 가중치 정보를 확인할 수 있습니다.<br><br>👻 미참가자<br>   현재 미참가자로 설정된 목록을 표시합니다.<br>   미참가자는 팀 생성 시 제외됩니다.<br><br>🚫 제약<br>   현재 설정된 제약 조건 목록을 표시합니다.<br>   특정 참가자들이 같은 팀에 배치되지 않도록 하는 규칙입니다.<br><br>🔒 히든<br>   히든 그룹과 히든 그룹 체인 목록을 표시합니다.<br>   확률 기반 그룹핑 규칙을 확인할 수 있습니다.<br><br>❓ help / 도움<br>   이 도움말을 표시합니다.<br><br>💡 TIP: 콘솔을 닫으려면 우측 상단의 X 버튼을 클릭하세요.<br>💡 TIP: cmd 또는 command를 입력하면 언제든 콘솔을 다시 열 수 있습니다.', 'info');
	},
	
	profileCommand() {
		this.log('🔄 프로필 이름을 입력하세요:', 'info');
		this.inputMode = 'profile-switch';
		this.input.placeholder = '프로필 이름 입력...';
		setTimeout(() => this.input.focus(), 50);
	},
	
	passwordCommand(newPassword) {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		// 인자가 제공된 경우 바로 처리
		if (newPassword) {
			const passwordToSet = newPassword.trim();
			
			database.ref(`rooms/${currentRoomKey}/password`).set(passwordToSet)
				.then(() => {
					this.log(`🔑 비밀번호가 변경되었습니다.`, 'success');
				})
				.catch((error) => {
					this.log(`비밀번호 변경 실패: ${error.message}`, 'error');
				});
		} else {
			// 인자가 없으면 입력 모드로 전환
			this.log('새 비밀번호를 입력하세요:', 'info');
			this.inputMode = 'password-change';
			this.input.type = 'password';
			this.input.placeholder = '새 비밀번호 입력...';
			setTimeout(() => this.input.focus(), 50);
		}
	},
	
	participantsCommand() {
		if (state.people.length === 0) {
			this.log('등록된 참가자가 없습니다.', 'info');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 👥 참가자 목록 (${state.people.length}명) ===</div>
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
			const genderIcon = person.gender === 'male' ? '♂️' : person.gender === 'female' ? '♀️' : '⚪';
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
		
		this.log(output, 'info');
	},
	
	nonParticipantsCommand() {
		if (state.inactivePeople.length === 0) {
			this.log('미참가자가 없습니다.', 'info');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 👻 미참가자 목록 (${state.inactivePeople.length}명) ===</div>
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
			const genderIcon = person.gender === 'male' ? '♂️' : person.gender === 'female' ? '♀️' : '⚪';
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
		
		this.log(output, 'info');
	},
	
	constraintsCommand() {
		const totalConstraints = state.forbiddenPairs.length + state.pendingConstraints.length;
		
		if (totalConstraints === 0) {
			this.log('설정된 제약 조건이 없습니다.', 'info');
			return;
		}
		
		let output = `=== 🚫 제약 조건 (${totalConstraints}개) ===<br><br>`;
		
		// 활성 제약 (forbiddenPairs)
		if (state.forbiddenPairs.length > 0) {
			output += `<strong>✅ 활성 제약 (${state.forbiddenPairs.length}개):</strong><br>`;
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
			output += `<strong>⏳ 보류 제약 (${state.pendingConstraints.length}개):</strong><br>`;
			state.pendingConstraints.forEach((constraint, index) => {
				output += `${index + 1}. ${constraint.left} ⛔ ${constraint.right}<br>`;
			});
		}
		
		this.log(output, 'info');
	},
	
	hiddenCommand() {
		const totalHidden = state.hiddenGroups.length + state.hiddenGroupChains.length + 
		                    state.pendingHiddenGroups.length + state.pendingHiddenGroupChains.length;
		
		if (totalHidden === 0) {
			this.log('설정된 히든 그룹이 없습니다.', 'info');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 🔗 히든 그룹 (${totalHidden}개) ===</div>`;
		
		// 활성 히든 그룹 (hiddenGroups)
		if (state.hiddenGroups.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">✅ 활성 히든 그룹 (${state.hiddenGroups.length}개):</div>
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">멤버 A</th>
							<th style="padding: 6px; text-align: left;">멤버 B</th>
							<th style="padding: 6px; text-align: center; width: 80px;">확률</th>
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
		
		// 활성 히든 그룹 체인 (hiddenGroupChains) - rowspan 사용
		if (state.hiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">✅ 활성 히든 그룹 체인 (${state.hiddenGroupChains.length}개):</div>
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left; width: 100px;">Primary</th>
							<th style="padding: 6px; text-align: left;">Candidate</th>
							<th style="padding: 6px; text-align: center; width: 80px;">확률</th>
						</tr>
					</thead>
					<tbody>`;
			
			state.hiddenGroupChains.forEach((chain) => {
				const primaryPerson = state.people.find(p => p.id === chain.primary);
				const candidates = chain.candidates || [];
				
				if (primaryPerson && candidates.length > 0) {
					candidates.forEach((candidate, idx) => {
						const candidatePerson = state.people.find(p => p.id === candidate.id);
						if (candidatePerson) {
							// probability가 1보다 크면 이미 퍼센트 값, 아니면 0~1 범위
							const displayPercent = candidate.probability > 1 ? Math.round(candidate.probability) : Math.round(candidate.probability * 100);
							if (idx === 0) {
								// 첨 번째 행: primary를 rowspan으로 표시
								output += `
									<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
										<td style="padding: 6px; vertical-align: top; border-right: 1px solid rgba(255,255,255,0.2);" rowspan="${candidates.length}">'${primaryPerson.name}'</td>
										<td style="padding: 6px;">'${candidatePerson.name}'</td>
										<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
									</tr>`;
							} else {
								// 나머지 행: primary 없이 candidate만
								output += `
									<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
										<td style="padding: 6px;">'${candidatePerson.name}'</td>
										<td style="padding: 6px; text-align: center; color: #fbbf24;">${displayPercent}%</td>
									</tr>`;
							}
						}
					});
				}
			});
			
			output += `
					</tbody>
				</table>
			</div>`;
		}
		
		// 보류 히든 그룹 (pendingHiddenGroups)
		if (state.pendingHiddenGroups.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">⏳ 보류 히든 그룹 (${state.pendingHiddenGroups.length}개):</div>`;
			state.pendingHiddenGroups.forEach((group, index) => {
				output += `<div style="padding: 4px 0;">${index + 1}. ${group.left} 🔗 ${group.right} (${Math.round(group.probability * 100)}%)</div>`;
			});
			output += `</div>`;
		}
		
		// 보류 히든 그룹 체인 (pendingHiddenGroupChains)
		if (state.pendingHiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">⏳ 보류 히든 그룹 체인 (${state.pendingHiddenGroupChains.length}개):</div>`;
			state.pendingHiddenGroupChains.forEach((chain, index) => {
				const candidatesStr = chain.candidates.map(c => {
					const displayPercent = c.probability > 1 ? Math.round(c.probability) : Math.round(c.probability * 100);
					return `${c.name}(${displayPercent}%)`;
				}).join(', ');
				output += `<div style="padding: 4px 0;">${index + 1}. ${chain.primary} → [${candidatesStr}]</div>`;
			});
			output += `</div>`;
		}
		
		output += `</div>`;
		
		this.log(output, 'info');
	},
	
	inputCommand(data) {
		// 참가자 추가 폼에 입력하는 것과 동일하게 처리
		if (!data || data.trim() === '') {
			// 데이터가 없으면 입력 모드로 전환
			this.log('참가자 데이터를 입력하세요:', 'info');
			this.log('예시: 홍길동,김철수 / 이영희(남)50 / A!B / C(80)D', 'info');
			this.inputMode = 'input-data';
			this.input.placeholder = '참가자 데이터 입력...';
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		// nameInput에 값을 설정하고 addPerson 함수 호출
		if (typeof addPerson === 'function' && elements.nameInput) {
			const originalValue = elements.nameInput.value;
			elements.nameInput.value = data;
			
			// addPerson 함수 실행
			addPerson();
			
			this.log(`참가자 추가 처리 완료: ${data}`, 'success');
		} else {
			this.log('참가자 추가 기능을 사용할 수 없습니다.', 'error');
		}
	}
};
