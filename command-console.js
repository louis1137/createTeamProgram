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
		
		// 전역 ESC 키 이벤트 리스너 (비밀번호 모드 취소용)
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' || e.keyCode === 27) {
				// 비밀번호 입력 모드에서 ESC 키를 누르면 읽기 전용 모드로 전환
				if (this.inputMode === 'auth' || this.inputMode === 'auth-switch' || 
				    this.inputMode === 'password-change' || this.inputMode === 'delete-confirm' ||
				    this.inputMode === 'delete-password-confirm' || this.inputMode === 'password-delete-confirm' ||
				    this.inputMode === 'matching') {
					e.preventDefault();
					e.stopPropagation();
					this.log('❌ 취소되었습니다.', 'info');
					this.inputMode = 'normal';
					if (this.input) {
						this.input.type = 'text';
						this.input.value = '';
						this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
					}
				}
			}
		});
		
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
				} else {
					// 프로필이 있는 경우
					// 비밀번호 입력 모드에서 닫으면 자동으로 읽기 모드로 전환
					if (this.inputMode === 'auth' || this.inputMode === 'auth-switch' || 
					    this.inputMode === 'password-change' || this.inputMode === 'delete-confirm' ||
					    this.inputMode === 'delete-password-confirm' || this.inputMode === 'password-delete-confirm' ||
					    this.inputMode === 'password-ask-initial' || this.inputMode === 'password-ask-switch' ||
					    this.inputMode === 'matching') {
						this.log('❌ 취소되었습니다.', 'info');
						this.inputMode = 'normal';
						
						// 확인 버튼이 표시되어 있다면 입력 필드로 복원
						this.restoreInputField();
						
						this.input.type = 'text';
						this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
					} else if (this.inputMode !== 'normal') {
						// 다른 특수 모드에서는 normal로 복귀
						this.inputMode = 'normal';
						this.input.type = 'text';
						this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
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
							this.log('🔄 실시간 동기화 활성화됨', 'success');
							this.log('비밀번호를 생성하시겠습니까?', 'info');
							this.inputMode = 'password-ask';
							this.showConfirmButtons();
						})
						.catch((error) => {
							this.log(`초기화 실패: ${error.message}`, 'error');
							this.log('비밀번호를 생성하시겠습니까?', 'info');
							this.inputMode = 'password-ask';
							this.showConfirmButtons();
						});
				} else {
					this.log('비밀번호를 생성하시겠습니까?', 'info');
					this.inputMode = 'password-ask';
					this.showConfirmButtons();
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
		} else if (this.inputMode === 'password-ask-switch') {
			// 프로필 전환 시 비밀번호 입력 확인
			if (confirmed) {
				this.log('🔒 비밀번호를 입력하세요:', 'info');
				this.inputMode = 'auth-switch';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = '비밀번호 입력...';
				setTimeout(() => this.input.focus(), 50);
			} else {
				// 비밀번호 입력 취소 - 읽기 전용 모드로 사용
				this.log('비밀번호 입력을 건너뛰었습니다.<br>읽기 전용 모드로 프로필을 사용합니다.', 'info');
				this.inputMode = 'normal';
				this.authenticated = false; // 인증되지 않음
				this.restoreInputField();
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
		} else if (this.inputMode === 'password-ask-initial') {
			// 초기 접속 시 비밀번호 입력 확인
			if (confirmed) {
				this.log('🔒 비밀번호를 입력하세요:', 'info');
				this.inputMode = 'auth';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = '비밀번호 입력...';
				setTimeout(() => this.input.focus(), 50);
			} else {
				// 비밀번호 입력 취소 - 읽기 전용 모드로 사용
				this.log('비밀번호 입력을 건너뛰었습니다.<br>읽기 전용 모드로 프로필을 사용합니다.', 'info');
				this.inputMode = 'normal';
				this.authenticated = false; // 인증되지 않음
				this.restoreInputField();
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
		} else if (this.inputMode === 'delete-confirm') {
			// 비밀번호 없을 때 삭제 확인
			if (confirmed) {
				this.log(`⚠️ 정말로 프로필 '${currentRoomKey}'를 삭제하시겠습니까?`, 'warning');
				this.log('삭제하려면 프로필 이름을 정확히 입력하세요:', 'info');
				this.inputMode = 'delete-final-confirm';
				this.restoreInputField();
				this.input.type = 'text';
				this.input.placeholder = '프로필 이름 입력...';
				setTimeout(() => this.input.focus(), 50);
			} else {
				this.log('삭제가 취소되었습니다.', 'info');
				this.inputMode = 'normal';
				this.restoreInputField();
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
		} else if (this.inputMode === 'password-delete-confirm') {
			// 비밀번호 삭제 확인
			if (confirmed) {
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}/password`).set('')
						.then(() => {
							this.log('🗑️ 비밀번호가 삭제되었습니다.', 'success');
							this.storedPassword = ''; // 저장된 비밀번호 초기화
						})
						.catch((error) => {
							this.log(`비밀번호 삭제 실패: ${error.message}`, 'error');
						});
				}
				this.inputMode = 'normal';
				this.restoreInputField();
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			} else {
				this.log('비밀번호 삭제가 취소되었습니다.<br>새 비밀번호를 입력하세요:', 'info');
				this.inputMode = 'password-change-new';
				this.restoreInputField();
				this.input.type = 'password';
				this.input.placeholder = '새 비밀번호 입력...';
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
					this.input.value = cmdText;
					this.input.focus();
				}
			});
		});
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
				this.log('✅ 규칙 제거 완료', 'success');
			} else {
				this.log('✅ 규칙 추가 완료', 'success');
			}
			
			// 확인하기 안내
			this.log('확인하기 (명령어: <code data-cmd="확률">확률</code>)', 'info');
			
			// 규칙 등록 후 일반 모드로 복귀
			this.inputMode = 'normal';
			this.input.type = 'text';
			this.input.placeholder = '명령어를 입력하세요...';
			return;
		}
		
		if (this.inputMode === 'profile' || this.inputMode === 'profile-switch') {
			if (!database && !initFirebase()) {
				this.log('Firebase 초기화에 실패했습니다.', 'error');
				return;
			}
			
			// 현재 프로필과 동일한 이름을 입력한 경우
			if (cmd === currentRoomKey) {
				this.log(`ℹ️ 이미 '${cmd}' 프로필을 사용 중입니다.`, 'info');
				this.log('현재 프로필을 유지합니다.', 'success');
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
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
										this.log(`✅ '${cmd}' 프로필로 전환 성공!`, 'success');
									} else {
										// 데이터가 없으면 초기화
										clearState();
										this.log(`✅ '${cmd}' 프로필로 전환 성공!`, 'success');
									}
								})
								.catch((error) => {
									this.log(`데이터 로드 실패: ${error.message}`, 'error');
								});
						} else {
							// 데이터 먼저 로드
							database.ref(`rooms/${currentRoomKey}`).once('value')
								.then((snapshot) => {
									const data = snapshot.val();
									if (data && (data.people || data.timestamp)) {
										loadStateFromData(data);
										this.log(`📡 프로필 '${cmd}' 발견`, 'info');
									} else {
										this.log(`📡 프로필 '${cmd}' 발견`, 'info');
									}
									this.log('🔄 실시간 동기화 활성화됨', 'success');
									
									if (!syncEnabled) {
										syncEnabled = true;
										setupRealtimeSync();
									}
									
									this.log('🔒 비밀번호를 입력하시겠습니까?', 'info');
									this.inputMode = 'password-ask-switch';
									this.showConfirmButtons();
								})
								.catch((error) => {
									this.log(`데이터 로드 실패: ${error.message}`, 'error');
									this.log('🔒 비밀번호를 입력하시겠습니까?', 'info');
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
									this.log(`📡 프로필 '${cmd}' 발견`, 'info');
								} else {
									this.log(`📡 프로필 '${cmd}' 발견`, 'info');
								}
								this.log('🔄 실시간 동기화 활성화됨', 'success');
								
								if (!syncEnabled) {
									syncEnabled = true;
									setupRealtimeSync();
								}
								
								this.log('🔒 비밀번호를 입력하시겠습니까?', 'info');
								this.inputMode = 'password-ask-initial';
								this.showConfirmButtons();
							})
							.catch((error) => {
								this.log(`데이터 로드 실패: ${error.message}`, 'error');
								this.log('🔒 비밀번호를 입력하시겠습니까?', 'info');
								this.inputMode = 'password-ask-initial';
								this.showConfirmButtons();
							});
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
							if (isSwitch) {
								this.log(`✅ '${this.tempProfile}' 프로필로 전환 성공!`, 'success');
							} else {
								this.log(`✅ 인증 성공!<br>콘솔이 준비되었습니다.`, 'success');
							}
						} else {
							// 데이터가 없으면 초기화
							clearState();
							if (isSwitch) {
								this.log(`✅ '${this.tempProfile}' 프로필로 전환 성공!`, 'success');
							} else {
								this.log('✅ 인증 성공!<br>콘솔이 준비되었습니다.', 'success');
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
			// 1단계: 현재 비밀번호 확인
			if (cmd === this.storedPassword) {
				this.log('현재 비밀번호가 확인되었습니다.', 'success');
				this.log('새 비밀번호를 입력하세요:', 'info');
				this.inputMode = 'password-change-new';
				this.input.placeholder = '새 비밀번호 입력...';
				setTimeout(() => this.input.focus(), 50);
			} else {
				this.log('현재 비밀번호가 일치하지 않습니다. 다시 시도해주세요.', 'error');
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
			return;
		}
		
		if (this.inputMode === 'password-change-new') {
			// 2단계: 새 비밀번호 입력
			if (!cmd || cmd.trim() === '') {
				// 빈 값이면 비밀번호 삭제 확인
				this.log('⚠️ 비밀번호를 삭제하시겠습니까?', 'warning');
				this.inputMode = 'password-delete-confirm';
				this.showConfirmButtons();
				return;
			}
			this.tempPassword = cmd;
			this.log('새 비밀번호를 다시 한번 입력해주세요:', 'info');
			this.inputMode = 'password-change-confirm';
			this.input.placeholder = '비밀번호 확인...';
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		if (this.inputMode === 'password-change-confirm') {
			// 3단계: 새 비밀번호 확인
			if (cmd === this.tempPassword) {
				if (database && currentRoomKey) {
					database.ref(`rooms/${currentRoomKey}/password`).set(this.tempPassword)
						.then(() => {
							this.log('🔑 비밀번호가 변경되었습니다.', 'success');
							this.storedPassword = this.tempPassword; // 저장된 비밀번호 업데이트
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
				this.inputMode = 'password-change-new';
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
		
		if (this.inputMode === 'delete-password-confirm') {
			// 삭제 전 비밀번호 확인
			if (cmd === this.storedPassword) {
				this.log('🔑 비밀번호가 확인되었습니다.', 'success');
				this.log(`⚠️ 정말로 프로필 '${currentRoomKey}'를 삭제하시겠습니까?`, 'warning');
				this.log('삭제하려면 프로필 이름을 정확히 입력하세요:', 'info');
				this.inputMode = 'delete-final-confirm';
				this.input.type = 'text';
				this.input.placeholder = '프로필 이름 입력...';
				setTimeout(() => this.input.focus(), 50);
			} else {
				this.log('비밀번호가 일치하지 않습니다. 삭제가 취소되었습니다.', 'error');
				this.inputMode = 'normal';
				this.input.type = 'text';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
			return;
		}
		
		if (this.inputMode === 'delete-final-confirm') {
			// 최종 확인: 프로필 이름 일치 확인
			if (cmd === currentRoomKey) {
				// Firebase에서 프로필 삭제
				database.ref(`rooms/${currentRoomKey}`).remove()
					.then(() => {
						this.log(`🗑️ 프로필 '${currentRoomKey}'가 완전히 삭제되었습니다.`, 'success');
						this.log('잠시 후 프로필 선택 화면으로 이동합니다...', 'info');
						
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
						this.log(`삭제 실패: ${error.message}`, 'error');
						this.inputMode = 'normal';
						this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
					});
			} else {
				this.log(`프로필 이름이 일치하지 않습니다. 삭제가 취소되었습니다.`, 'error');
				this.inputMode = 'normal';
				this.input.placeholder = '명령어를 입력하세요... (예: save, load, clear)';
			}
			return;
		}
		
		if (!this.authenticated && currentRoomKey) {
			// 읽기 모드에서는 save와 입력 관련 명령어만 차단
			const [command] = cmd.split(' ');
			const writeCommands = ['save', '저장', 'input', '입력', 'clear', '초기화'];
			if (writeCommands.includes(command.toLowerCase())) {
				this.log('⚠️ 읽기 전용 모드입니다. 이 명령어를 사용하려면 인증이 필요합니다.', 'warning');
				this.log('인증하려면 <code data-cmd="로그인">로그인</code> 또는 <code data-cmd="login">login</code> 명령어를 사용하세요.', 'info');
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
				this.participantsCommand();
				break;
			case '미참가자':
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
				this.matchingCommand();
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
				this.log(`💾 저장 완료!`, 'success');
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
					this.log(`📥 데이터 로드 완료!`, 'success');
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
		
		if (confirm('⚠️ 참가자, 미참가자, 제약, 확률 그룹, 옵션 설정을 모두 초기화하시겠습니까?\n(비밀번호와 프로필은 유지됩니다)')) {
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
					this.log('🗑️ 데이터 초기화 완료 (비밀번호 유지)', 'success');
				})
				.catch((error) => {
					this.log(`초기화 실패: ${error.message}`, 'error');
				});
		}
	},
	
	statusCommand() {
		this.log('=== 현재 상태 ===<br>Room Key: ' + (currentRoomKey || '없음') + '<br>Firebase: ' + (syncEnabled ? '활성화' : '비활성화') + '<br>참가자: ' + state.people.length + '명<br>미참가자: ' + state.inactivePeople.length + '명<br>제약: ' + state.forbiddenPairs.length + '개', 'info');
	},
	
	
	helpCommand() {
		this.log('=== 📋 명령어 도움말 ===<br><br>' +
			'💾 <code data-cmd="save">save</code> / <code data-cmd="저장">저장</code> <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   현재 참가자, 미참가자, 제약 조건, 설정 등 모든 상태를 서버에 저장합니다.<br>   동일한 Room Key로 접속한 다른 사용자들과 실시간으로 공유됩니다.<br><br>' +
			'📥 <code data-cmd="load">load</code> / <code data-cmd="불러오기">불러오기</code><br>   서버에 저장된 데이터를 불러옵니다.<br>   최신 저장 상태로 복원되며, 화면이 자동으로 업데이트됩니다.<br><br>' +
			'🗑️ <code data-cmd="clear">clear</code> / <code data-cmd="초기화">초기화</code> <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   참가자, 미참가자, 제약, 확률 그룹, 옵션 설정을 모두 초기화합니다.<br>   ⚠️ 비밀번호와 프로필은 유지되며, 초기화된 데이터는 복구할 수 없습니다.<br><br>' +
			'🗑️ <code data-cmd="delete">delete</code> / <code data-cmd="삭제">삭제</code> <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   현재 프로필을 완전히 삭제합니다.<br>   ⚠️ 비밀번호 확인과 프로필 이름 확인 후 삭제되며 복구할 수 없습니다.<br>   삭제 후 프로필 선택 화면으로 이동합니다.<br><br>' +
			'📊 <code data-cmd="status">status</code> / <code data-cmd="상태">상태</code><br>   현재 Room Key, Firebase 연결 상태, 참가자 수, 미참가자 수,<br>   제약 조건 개수 등 현재 상태를 확인합니다.<br><br>' +
			'🔓 <code data-cmd="login">login</code> / <code data-cmd="로그인">로그인</code><br>   읽기 전용 모드에서 쓰기 모드로 전환합니다.<br>   비밀번호를 입력하여 인증하면 데이터 수정이 가능합니다.<br><br>' +
			'🚪 <code data-cmd="logout">logout</code> / <code data-cmd="종료">종료</code><br>   쓰기 모드에서 읽기 전용 모드로 전환합니다.<br>   다시 로그인하려면 login 명령어를 사용하세요.<br><br>' +
			'🔑 <code data-cmd="password">password</code> / <code data-cmd="비밀번호">비밀번호</code> <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   현재 프로필의 비밀번호를 변경합니다.<br>   현재 비밀번호를 확인한 후 새 비밀번호를 두 번 입력하여 변경합니다.<br><br>' +
			'👤 <code data-cmd="profile">profile</code> / <code data-cmd="프로필">프로필</code><br>   다른 프로필로 전환합니다.<br>   프로필 이름을 입력하면 해당 프로필로 전환하고 데이터를 불러옵니다.<br>   존재하지 않는 프로필이면 생성 여부를 묻습니다.<br><br>' +
			'✏️ <code data-cmd="input ">input</code> / <code data-cmd="입력 ">입력</code> [참가자 데이터] <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   참가자 추가 폼과 동일한 방식으로 참가자를 추가합니다.<br>   예시: 입력 홍길동,김철수 / 이영희(남)50 / A!B / C(80)D<br>   쉼표로 그룹 구분, / 로 토큰 구분, ! 로 제약, () 로 확률/가중치 설정<br><br>' +
			'👥 <code data-cmd="참가자">참가자</code><br>   현재 등록된 모든 참가자 목록을 표시합니다.<br>   각 참가자의 이름, 성별, 가중치 정보를 확인할 수 있습니다.<br><br>' +
			'👻 <code data-cmd="미참가자">미참가자</code><br>   현재 미참가자로 설정된 목록을 표시합니다.<br>   미참가자는 팀 생성 시 제외됩니다.<br><br>' +
			'🚫 <code data-cmd="제약">제약</code><br>   현재 설정된 제약 조건 목록을 표시합니다.<br>   특정 참가자들이 같은 팀에 배치되지 않도록 하는 규칙입니다.<br><br>' +
			'� <code data-cmd="규칙">규칙</code> / <code data-cmd="rule">rule</code> <span style="color: #22c55e; font-weight: bold;">(인증필요)</span><br>   확률 규칙을 등록합니다.<br>   예시: 규칙 → input A(40)B 형식으로 등록<br><br>' +
			'�🎲 <code data-cmd="확률">확률</code><br>   확률 규칙 목록을 표시합니다.<br>   특정 참가자들이 설정된 확률로 같은 팀에 배치되도록 하는 규칙입니다.<br><br>' +
			'❓ <code data-cmd="help">help</code> / <code data-cmd="도움">도움</code><br>   이 도움말을 표시합니다.<br><br>' +
			'💡 TIP: 콘솔을 닫으려면 우측 상단의 X 버튼을 클릭하세요.<br>' +
			'💡 TIP: cmd 또는 command를 입력하면 언제든 콘솔을 다시 열 수 있습니다.', 'info');
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
		
		// 현재 비밀번호가 없는지 확인
		if (!this.storedPassword || this.storedPassword === '') {
			// 비밀번호가 없으면 바로 새 비밀번호 입력 모드로
			this.log('새 비밀번호를 입력하세요:', 'info');
			this.inputMode = 'password-change-new';
			this.input.type = 'password';
			this.input.placeholder = '새 비밀번호 입력...';
			setTimeout(() => this.input.focus(), 50);
			return;
		}
		
		// 인자가 제공된 경우 - 비밀번호 변경 플로우 시작
		if (newPassword && newPassword.trim()) {
			this.log('⚠️ 보안을 위해 비밀번호 변경은 대화형 모드로만 가능합니다.', 'warning');
			this.log('현재 비밀번호를 입력하세요:', 'info');
			this.inputMode = 'password-change';
			this.input.type = 'password';
			this.input.placeholder = '현재 비밀번호 입력...';
			setTimeout(() => this.input.focus(), 50);
		} else {
			// 인자가 없으면 비밀번호 변경 모드로 전환
			this.log('현재 비밀번호를 입력하세요:', 'info');
			this.inputMode = 'password-change';
			this.input.type = 'password';
			this.input.placeholder = '현재 비밀번호 입력...';
			setTimeout(() => this.input.focus(), 50);
		}
	},
	
	loginCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		if (this.authenticated) {
			this.log('✅ 이미 로그인되어 있습니다.', 'info');
			return;
		}
		
		// 비밀번호 입력 모드로 전환
		this.log('🔐 비밀번호를 입력하세요:', 'info');
		this.inputMode = 'auth';
		this.input.type = 'password';
		this.input.placeholder = '비밀번호 입력...';
		setTimeout(() => this.input.focus(), 50);
	},
	
	logoutCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		if (!this.authenticated) {
			this.log('ℹ️ 이미 읽기 전용 모드입니다.', 'info');
			return;
		}
		
		// 쓰기 모드에서 읽기 모드로 전환
		this.authenticated = false;
		this.log('🚪 로그아웃되었습니다. 읽기 전용 모드로 전환합니다.', 'success');
		this.log('💡 다시 로그인하려면 <code data-cmd="login">login</code> 또는 <code data-cmd="로그인">로그인</code> 명령어를 사용하세요.', 'info');
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
	
	matchingCommand() {
		if (!this.authenticated) {
			this.log('🚫 확률 규칙 등록은 읽기 전용 모드에서 사용할 수 없습니다.', 'error');
			this.log('💡 먼저 <code data-cmd="login">login</code> 또는 <code data-cmd="로그인">로그인</code> 명령어로 인증하세요.', 'info');
			return;
		}
		
		this.log('📝 <strong>매칭될 확률을 설정합니다.</strong>', 'info');
		this.log('<code>기준 참가자(확률)매칭될 참가자</code>', 'info');
		this.log('예) A(40)B(30)C(20)D', 'info');
		this.log('<code>기준 참가자(확률)매칭될 참가자1(확률)매칭될 참가자2</code>', 'info');
		this.log('📊 설정된 매칭 그룹을 보려면 <code data-cmd="확률">확률</code> 명령어를 입력하세요.', 'info');
		
		// 규칙 입력 모드로 전환
		this.inputMode = 'matching';
		this.input.placeholder = '확률 규칙을 입력하세요. 예) A(30)B';
		setTimeout(() => this.input.focus(), 50);
	},
	
	hiddenCommand() {
		const totalHidden = state.hiddenGroups.length + state.hiddenGroupChains.length + 
		                    state.pendingHiddenGroups.length + state.pendingHiddenGroupChains.length;
		
		if (totalHidden === 0) {
			this.log('확률 규칙이 없습니다.', 'info');
			return;
		}
		
		let output = `<div style="margin: 10px 0;">
			<div style="font-weight: bold; margin-bottom: 8px;">=== 🔗 확률 규칙 (${totalHidden}개) ===</div>`;
		
		// 확률 기반 그룹 (hiddenGroups)
		if (state.hiddenGroups.length > 0) {
			output += `<div style="margin: 10px 0;">
				<div style="font-weight: bold; margin-bottom: 5px;">✅ 확률 규칙 (${state.hiddenGroups.length}개):</div>
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
		
		// 확률 규칙 체인 (hiddenGroupChains) - rowspan 사용
		if (state.hiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">멤버 A</th>
							<th style="padding: 6px; text-align: left;">멤버 B</th>
							<th style="padding: 6px; text-align: center; width: 80px;">확률</th>
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
				<div style="font-weight: bold; margin-bottom: 5px;">⏳ 보류 확률 규칙 (${state.pendingHiddenGroups.length}개):</div>`;
			state.pendingHiddenGroups.forEach((group, index) => {
				output += `<div style="padding: 4px 0;">${index + 1}. ${group.left} 🔗 ${group.right} (${Math.round(group.probability * 100)}%)</div>`;
			});
			output += `</div>`;
		}
		
		// 보류 확률 기반 그룹 체인 (pendingHiddenGroupChains)
		if (state.pendingHiddenGroupChains.length > 0) {
			output += `<div style="margin: 10px 0;">
				<table style="width: 100%; border-collapse: collapse; font-size: 12px;">
					<thead>
						<tr style="background: rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.2);">
							<th style="padding: 6px; text-align: left;">멤버 A</th>
							<th style="padding: 6px; text-align: left;">멤버 B</th>
							<th style="padding: 6px; text-align: center; width: 80px;">확률</th>
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
			
			// addPerson 함수 실행 (fromConsole=true 전달)
			addPerson(true);
			
			this.log(`참가자 추가 처리 완료: ${data}`, 'success');
		} else {
			this.log('참가자 추가 기능을 사용할 수 없습니다.', 'error');
		}
	},
	
	deleteCommand() {
		if (!syncEnabled || !currentRoomKey) {
			this.log('Firebase가 설정되지 않았거나 Room Key가 없습니다.', 'error');
			return;
		}
		
		if (!this.authenticated) {
			this.log('🚫 프로필 삭제는 읽기 전용 모드에서 사용할 수 없습니다.', 'error');
			this.log('💡 먼저 <code data-cmd="login">login</code> 또는 <code data-cmd="로그인">로그인</code> 명령어로 인증하세요.', 'info');
			return;
		}
		
		this.log(`🔥 프로필 '${currentRoomKey}'를 삭제하려고 합니다.`, 'warning');
		this.log('⚠️ 이 작업은 되돌릴 수 없습니다!', 'warning');
		
		// 비밀번호가 있는지 확인
		if (this.storedPassword && this.storedPassword !== '') {
			// 비밀번호가 있으면 비밀번호 입력 모드
			this.log('비밀번호를 입력하여 확인하세요:', 'info');
			this.inputMode = 'delete-password-confirm';
			this.input.type = 'password';
			this.input.placeholder = '비밀번호 입력...';
			setTimeout(() => this.input.focus(), 50);
		} else {
			// 비밀번호가 없으면 확인/취소 버튼 표시
			this.log('삭제하시겠습니까?', 'warning');
			this.inputMode = 'delete-confirm';
			this.showConfirmButtons();
		}
	}
};
