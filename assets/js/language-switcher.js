// Language detection and switching functionality
(function() {
    'use strict';

    // Get current language from URL or localStorage
    function getCurrentLanguage() {
        const path = window.location.pathname;
        if (path.startsWith('/ko/') || path.startsWith('/ko')) {
            return 'ko';
        } else if (path.startsWith('/en/') || path.startsWith('/en')) {
            return 'en';
        }
        
        // Check localStorage for saved preference
        const savedLang = localStorage.getItem('preferred-language');
        if (savedLang) {
            return savedLang;
        }
        
        // Detect browser language
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang.startsWith('ko')) {
            return 'ko';
        }
        
        return 'en'; // Default to English
    }

    // Detect browser language and redirect if needed
    function detectAndRedirect() {
        const path = window.location.pathname;
        
        // If we're on the root path, redirect based on saved preference or detected language
        if (path === '/' || path === '') {
            // Check localStorage first
            const savedLang = localStorage.getItem('preferred-language');
            let targetLang = 'en';
            
            if (savedLang) {
                targetLang = savedLang;
            } else {
                // Detect browser language only if no saved preference
                const browserLang = navigator.language || navigator.userLanguage;
                if (browserLang.startsWith('ko')) {
                    targetLang = 'ko';
                }
                // Save the detected preference
                localStorage.setItem('preferred-language', targetLang);
            }
            
            // Redirect to language-specific path
            window.location.href = '/' + targetLang + path;
        }
    }

    // Switch language
    function switchLanguage(lang) {
        const currentPath = window.location.pathname;
        let newPath;
        
        // Check if we're on a project detail page
        const projectMatch = currentPath.match(/\/(ko|en)\/works\/(.+)/);
        if (projectMatch) {
            // We're on a project detail page, keep the same project
            const projectName = projectMatch[2];
            newPath = '/' + lang + '/works/' + projectName;
        } else {
            // Regular page, just change language prefix
            const pathWithoutLang = currentPath.replace(/^\/(ko|en)/, '');
            newPath = '/' + lang + pathWithoutLang;
        }
        
        // Save preference
        localStorage.setItem('preferred-language', lang);
        
        // Redirect
        window.location.href = newPath;
    }

    // 프로젝트 상세 페이지 언어 전환 함수
    function switchProjectLanguage(lang) {
        const currentPath = window.location.pathname;
        
        // 현재 경로에서 프로젝트명 추출
        const projectMatch = currentPath.match(/\/(ko|en)\/works\/(.+)/);
        if (projectMatch) {
            const projectName = projectMatch[2];
            const newPath = '/' + lang + '/works/' + projectName;
            window.location.href = newPath;
        }
    }

    // Handle navigation links
    function fixNavigationLinks() {
        // Handle anchor links for smooth scrolling
        const anchorLinks = document.querySelectorAll('a[href^="#"]');
        anchorLinks.forEach(link => {
            // Remove any existing click handlers to avoid duplicates
            link.removeEventListener('click', handleAnchorClick);
            // Add click handler for smooth scrolling to anchors
            link.addEventListener('click', handleAnchorClick);
        });
    }
    
    // Handle anchor link clicks
    function handleAnchorClick(e) {
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Initialize language switcher
    function initLanguageSwitcher() {
        // Add click handlers to language switcher links
        document.addEventListener('DOMContentLoaded', function() {
            const koLink = document.querySelector('a[data-lang="ko"]');
            const enLink = document.querySelector('a[data-lang="en"]');
            
            if (koLink) {
                koLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchLanguage('ko');
                });
            }
            
            if (enLink) {
                enLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    switchLanguage('en');
                });
            }
            
            // Update language switcher visual state
            updateLanguageSwitcherState();
            
            // Fix navigation links
            fixNavigationLinks();
        });
    }

    // Update language switcher visual state
    function updateLanguageSwitcherState() {
        const currentLang = getCurrentLanguage();
        const koLink = document.querySelector('a[data-lang="ko"]');
        const enLink = document.querySelector('a[data-lang="en"]');
        
        if (koLink) {
            if (currentLang === 'ko') {
                koLink.classList.add('active');
            } else {
                koLink.classList.remove('active');
            }
        }
        
        if (enLink) {
            if (currentLang === 'en') {
                enLink.classList.add('active');
            } else {
                enLink.classList.remove('active');
            }
        }
    }

    // Load language-specific content
    function loadLanguageContent(lang) {
        // This function will be called by the template to load content
        window.currentLanguage = lang;
        
        // Update page language attribute
        document.documentElement.lang = lang;
        
        // Add language class to body
        document.body.classList.add('lang-' + lang);
    }

    // Expose functions globally
    window.LanguageSwitcher = {
        getCurrentLanguage: getCurrentLanguage,
        switchLanguage: switchLanguage,
        switchProjectLanguage: switchProjectLanguage,
        loadLanguageContent: loadLanguageContent,
        detectAndRedirect: detectAndRedirect,
        fixNavigationLinks: fixNavigationLinks,
        updateLanguageSwitcherState: updateLanguageSwitcherState
    };

    // Initialize on page load
    initLanguageSwitcher();
    
    // Auto-detect and redirect if on root
    if (window.location.pathname === '/' || window.location.pathname === '') {
        detectAndRedirect();
    }

    // Expose switchProjectLanguage globally for inline onclick
    window.switchProjectLanguage = switchProjectLanguage;

})(); 