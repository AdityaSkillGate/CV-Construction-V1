import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ProjectModalComponent } from '../../shared/components/project-modal/project-modal.component';
import { ProjectDataService } from '../../core/services/project-data.service';
import { Project, ServiceItem, ProcessStep, StatItem, WhyFeature, TestimonialItem, ConstructionStage, WhatWeDoService, AreaServedItem } from '../../core/models/project.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    NavbarComponent,
    FooterComponent,
    ProjectModalComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('heroVideo', { static: false }) heroVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('scrollTrack', { static: false }) scrollTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollVideo', { static: false }) scrollVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('aboutSection', { static: false }) aboutSection!: ElementRef<HTMLElement>;

  isHeroVideoPlaying = false;

  // Data arrays from service
  stages: ConstructionStage[] = [];
  stats: StatItem[] = [];
  services: ServiceItem[] = [];
  projects: Project[] = [];
  whatWeDoServices: WhatWeDoService[] = [];
  featuredDevelopments: Project[] = [];
  areasWeServe: AreaServedItem[] = [];
  processSteps: ProcessStep[] = [];
  whyFeatures: WhyFeature[] = [];
  testimonials: TestimonialItem[] = [];

  // Active state
  selectedCategory = 'All';
  categories = ['All', 'Commercial', 'Residential', 'Industrial', 'Renovation', 'Turnkey'];
  selectedProject: Project | null = null;
  activeProcessStep = 0;

  // Scroll Video scrub state
  scrollProgress = 0;
  displayProgress = '00%';
  activeStage: ConstructionStage | null = null;
  isTimelapseMode = true; // true: 7-Stage Ground-Up Site Build (video1.mp4); false: 3D Facade Assembly (video2.mp4)
  activeVideoSource = 'assets/videos/video1.mp4';
  isAutoPlaying = false;
  autoPlayTimer: any = null;

  private rafId: number | null = null;
  private targetVideoTime = 0;
  private isSeeking = false;
  private pendingSeekTime: number | null = null;
  private seekTimeoutId: any = null;

  // Animated Stats
  statsAnimated = false;
  animatedStatValues: number[] = [0, 0, 0, 0];

  // Contact Form Model & WhatsApp Config
  whatsappNumber = '919876543210';
  lastWhatsappUrl = '';
  validationError = '';
  contactModel = {
    name: '',
    email: '',
    phone: '',
    projectType: 'Commercial',
    projectLocation: '',
    description: '',
    submitted: false
  };

  constructor(private projectData: ProjectDataService) {}

  ngOnInit(): void {
    this.stages = this.projectData.getConstructionStages();
    this.stats = this.projectData.getStats();
    this.services = this.projectData.getServices();
    this.whatWeDoServices = this.projectData.getWhatWeDoServices();
    this.featuredDevelopments = this.projectData.getFeaturedDevelopments();
    this.areasWeServe = this.projectData.getAreasWeServe();
    this.projects = this.projectData.getProjects();
    this.processSteps = this.projectData.getProcessSteps();
    this.whyFeatures = this.projectData.getWhyFeatures();
    this.testimonials = this.projectData.getTestimonials();

    if (this.stages.length > 0) {
      this.activeStage = this.stages[0];
    }
  }

  ngAfterViewInit(): void {
    // Initialize hero video autoplay with fallback handling
    this.initHeroVideo();

    // Initialize scroll video listeners and seek engine
    this.initScrollVideo();

    // Start RAF loop for responsive video scrubbing
    this.startVideoScrubLoop();
    this.initIntersectionObservers();
    
    // Initial sync
    setTimeout(() => {
      this.updateScrollVideoProgress();
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
    }
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
    }
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (this.isAutoPlaying) {
      // User manual scroll overrides auto demo
      this.isAutoPlaying = false;
      if (this.scrollVideo?.nativeElement) {
        this.scrollVideo.nativeElement.pause();
      }
    }
    this.updateScrollVideoProgress();
  }

  @HostListener('window:resize', [])
  onResize(): void {
    this.updateScrollVideoProgress();
  }

  /**
   * Initializes the scroll video properties and binds decoder event listeners
   */
  private initScrollVideo(): void {
    if (!this.scrollVideo?.nativeElement) return;
    const video = this.scrollVideo.nativeElement;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.pause();

    video.addEventListener('seeked', () => this.onVideoSeeked());
    video.addEventListener('timeupdate', () => this.onAutoDemoTimeUpdate());
    video.addEventListener('ended', () => {
      if (this.isAutoPlaying) {
        this.isAutoPlaying = false;
        this.updateScrollVideoProgress();
      }
    });
  }

  /**
   * Smoothly computes scroll progress across the #scroll-building section
   * and maps it accurately to Video 2 timeline with proper direction
   */
  private updateScrollVideoProgress(): void {
    if (!this.scrollTrack || !this.scrollVideo || this.isAutoPlaying) return;

    const trackEl = this.scrollTrack.nativeElement;
    const video = this.scrollVideo.nativeElement;
    if (!video.duration || isNaN(video.duration)) return;

    const rect = trackEl.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const scrollDist = rect.height - windowHeight;

    if (scrollDist <= 0) return;

    // Progress 0 to 1
    const rawProgress = -rect.top / scrollDist;
    const clampedProgress = Math.max(0, Math.min(1, rawProgress));

    this.scrollProgress = clampedProgress;
    this.displayProgress = Math.round(clampedProgress * 100).toString().padStart(2, '0') + '%';

    // Update active stage
    const percent = clampedProgress * 100;
    const matched = this.stages.find(s => percent >= s.percentRange[0] && percent <= s.percentRange[1]);
    if (matched) {
      this.activeStage = matched;
    } else if (percent >= 90) {
      this.activeStage = this.stages[this.stages.length - 1];
    }

    // Video 1 (Site Construction Timelapse): 0s is empty dirt excavation (Foundation) -> 8s is completed building!
    // Video 2 (3D Facade X-Ray): 10s is bare structural skeleton -> 0s is assembled facade.
    const duration = video.duration || (this.isTimelapseMode ? 8 : 10);
    const maxTime = Math.max(0, duration - 0.05);

    if (this.isTimelapseMode) {
      this.targetVideoTime = clampedProgress * maxTime;
    } else {
      this.targetVideoTime = (1 - clampedProgress) * maxTime;
    }

    this.performSeek(this.targetVideoTime);
  }

  /**
   * Dispatches seek requests through a non-blocking seek lock to prevent decoder choking
   */
  private performSeek(time: number): void {
    if (!this.scrollVideo?.nativeElement) return;
    const video = this.scrollVideo.nativeElement;

    if (this.isSeeking) {
      this.pendingSeekTime = time;
      return;
    }

    if (Math.abs(video.currentTime - time) < 0.025) {
      return;
    }

    this.isSeeking = true;
    video.currentTime = time;

    // Safety timeout in case browser skips or drops the seeked event
    if (this.seekTimeoutId) clearTimeout(this.seekTimeoutId);
    this.seekTimeoutId = setTimeout(() => {
      if (this.isSeeking) {
        this.isSeeking = false;
        if (this.pendingSeekTime !== null) {
          const next = this.pendingSeekTime;
          this.pendingSeekTime = null;
          this.performSeek(next);
        }
      }
    }, 350);
  }

  private onVideoSeeked(): void {
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }
    this.isSeeking = false;
    if (this.pendingSeekTime !== null) {
      const nextTime = this.pendingSeekTime;
      this.pendingSeekTime = null;
      this.performSeek(nextTime);
    }
  }

  private startVideoScrubLoop(): void {
    const loop = () => {
      if (this.scrollVideo && !this.isAutoPlaying) {
        const video = this.scrollVideo.nativeElement;
        if (video.readyState >= 2) {
          this.performSeek(this.targetVideoTime);
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private onAutoDemoTimeUpdate(): void {
    if (!this.isAutoPlaying || !this.scrollVideo?.nativeElement) return;
    const video = this.scrollVideo.nativeElement;
    const duration = video.duration || 10;
    const progress = Math.max(0, Math.min(1, video.currentTime / duration));
    this.scrollProgress = progress;
    this.displayProgress = Math.round(progress * 100).toString().padStart(2, '0') + '%';

    const percent = progress * 100;
    const matched = this.stages.find(s => percent >= s.percentRange[0] && percent <= s.percentRange[1]);
    if (matched) {
      this.activeStage = matched;
    } else if (percent >= 90) {
      this.activeStage = this.stages[this.stages.length - 1];
    }
  }

  toggleVideoView(): void {
    this.isTimelapseMode = !this.isTimelapseMode;
    this.activeVideoSource = this.isTimelapseMode ? 'assets/videos/video1.mp4' : 'assets/videos/video2.mp4';
    if (this.scrollVideo?.nativeElement) {
      const v = this.scrollVideo.nativeElement;
      v.src = this.activeVideoSource;
      v.load();
      v.onloadedmetadata = () => {
        this.updateScrollVideoProgress();
      };
    }
  }

  toggleAutoDemo(): void {
    this.isAutoPlaying = !this.isAutoPlaying;
    if (this.isAutoPlaying) {
      if (this.scrollVideo) {
        const video = this.scrollVideo.nativeElement;
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    } else {
      if (this.scrollVideo) {
        this.scrollVideo.nativeElement.pause();
      }
      this.updateScrollVideoProgress();
    }
  }

  selectStage(stage: ConstructionStage): void {
    if (this.isAutoPlaying) {
      this.isAutoPlaying = false;
      this.scrollVideo?.nativeElement?.pause();
    }
    this.activeStage = stage;
    const targetProgress = (stage.percentRange[0] + stage.percentRange[1]) / 200;
    if (this.scrollTrack) {
      const trackEl = this.scrollTrack.nativeElement;
      const windowHeight = window.innerHeight;
      const scrollDist = trackEl.scrollHeight - windowHeight;
      const trackTop = trackEl.getBoundingClientRect().top + window.scrollY;
      const targetScrollTop = trackTop + (targetProgress * scrollDist);
      window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    }
  }

  private initIntersectionObservers(): void {
    if (!this.aboutSection) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !this.statsAnimated) {
          this.animateCounters();
          this.statsAnimated = true;
        }
      });
    }, { threshold: 0.25 });

    observer.observe(this.aboutSection.nativeElement);
  }

  private animateCounters(): void {
    const duration = 2000;
    const frameRate = 30;
    const totalFrames = Math.round(duration / (1000 / frameRate));

    this.stats.forEach((stat, idx) => {
      let currentFrame = 0;
      const target = stat.value;
      const timer = setInterval(() => {
        currentFrame++;
        const progress = currentFrame / totalFrames;
        // Ease out quadratic
        const ease = 1 - (1 - progress) * (1 - progress);
        this.animatedStatValues[idx] = Math.round(target * ease);

        if (currentFrame >= totalFrames) {
          this.animatedStatValues[idx] = target;
          clearInterval(timer);
        }
      }, 1000 / frameRate);
    });
  }

  get filteredProjects(): Project[] {
    if (this.selectedCategory === 'All') return this.projects;
    return this.projects.filter(p => p.category === this.selectedCategory);
  }

  filterCategory(cat: string): void {
    this.selectedCategory = cat;
  }

  openProjectModal(proj: Project): void {
    this.selectedProject = proj;
  }

  closeProjectModal(): void {
    this.selectedProject = null;
  }

  handleModalConsult(proj: Project): void {
    this.closeProjectModal();
    this.contactModel.projectType = proj.category;
    this.contactModel.projectLocation = proj.location;
    this.contactModel.description = `Inquiry regarding developments similar to ${proj.name}.`;
    this.scrollTo('contact');
  }

  selectProcessStep(index: number): void {
    this.activeProcessStep = index;
  }

  scrollTo(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  submitEnquiry(): void {
    this.validationError = '';

    if (!this.contactModel.name || !this.contactModel.name.trim()) {
      this.validationError = 'Please enter your name.';
      const nameInput = document.getElementById('name');
      if (nameInput) nameInput.focus();
      return;
    }

    // Construct formatted message for WhatsApp
    const lines: string[] = [
      '🏗️ *NEW PROJECT ENQUIRY — GV CONSTRUCTION*',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `👤 *Name:* ${this.contactModel.name.trim()}`
    ];

    if (this.contactModel.phone?.trim()) {
      lines.push(`📞 *Phone:* ${this.contactModel.phone.trim()}`);
    }
    if (this.contactModel.email?.trim()) {
      lines.push(`✉️ *Email:* ${this.contactModel.email.trim()}`);
    }
    lines.push(`🏢 *Project Type:* ${this.contactModel.projectType}`);
    if (this.contactModel.projectLocation?.trim()) {
      lines.push(`📍 *Location:* ${this.contactModel.projectLocation.trim()}`);
    }
    if (this.contactModel.description?.trim()) {
      lines.push(`📝 *Details:* ${this.contactModel.description.trim()}`);
    }

    const message = lines.join('\n');
    const encodedText = encodeURIComponent(message);
    this.lastWhatsappUrl = `https://wa.me/${this.whatsappNumber}?text=${encodedText}`;

    // Mark as submitted to update confirmation state
    this.contactModel.submitted = true;

    // Open WhatsApp: try popup first, but if blocked, navigate directly
    if (typeof window !== 'undefined') {
      let popupOpened = false;
      try {
        const win = window.open(this.lastWhatsappUrl, '_blank');
        if (win && !win.closed && typeof win.closed !== 'undefined') {
          popupOpened = true;
        }
      } catch (e) {
        popupOpened = false;
      }

      // If popup blocker intervened or on mobile, redirect directly to WhatsApp
      if (!popupOpened) {
        window.location.href = this.lastWhatsappUrl;
      }
    }
  }

  resetContactForm(): void {
    this.validationError = '';
    this.lastWhatsappUrl = '';
    this.contactModel = {
      name: '',
      email: '',
      phone: '',
      projectType: 'Commercial',
      projectLocation: '',
      description: '',
      submitted: false
    };
  }

  /**
   * Initializes and ensures reliable playback of the hero background video.
   * Browsers require the DOM property video.muted = true (not just the HTML attribute)
   * to satisfy autoplay policies. Also provides fallback listeners for user gesture unlocking.
   */
  private initHeroVideo(): void {
    if (!this.heroVideo?.nativeElement) return;
    const video = this.heroVideo.nativeElement;

    // Explicitly set DOM properties to bypass browser autoplay restrictions
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    const attemptPlay = () => {
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isHeroVideoPlaying = true;
          })
          .catch((err) => {
            console.warn('Hero video autoplay blocked by browser policy; listening for interaction:', err);
            this.isHeroVideoPlaying = false;
            // Retry playback on first user gesture
            const unlockPlay = () => {
              video.muted = true;
              video.play().then(() => {
                this.isHeroVideoPlaying = true;
              }).catch(() => {});
              window.removeEventListener('click', unlockPlay);
              window.removeEventListener('touchstart', unlockPlay);
              window.removeEventListener('scroll', unlockPlay);
              window.removeEventListener('keydown', unlockPlay);
            };
            window.addEventListener('click', unlockPlay, { once: true, passive: true });
            window.addEventListener('touchstart', unlockPlay, { once: true, passive: true });
            window.addEventListener('scroll', unlockPlay, { once: true, passive: true });
            window.addEventListener('keydown', unlockPlay, { once: true, passive: true });
          });
      }
    };

    video.addEventListener('play', () => { this.isHeroVideoPlaying = true; });
    video.addEventListener('pause', () => { this.isHeroVideoPlaying = false; });
    video.addEventListener('ended', () => {
      video.currentTime = 0;
      attemptPlay();
    });

    if (video.readyState >= 2) {
      attemptPlay();
    } else {
      video.addEventListener('loadeddata', () => attemptPlay(), { once: true });
      attemptPlay();
    }
  }

  toggleHeroVideo(): void {
    if (!this.heroVideo?.nativeElement) return;
    const video = this.heroVideo.nativeElement;
    if (video.paused) {
      video.muted = true;
      video.play().then(() => {
        this.isHeroVideoPlaying = true;
      }).catch(err => console.error('Failed to play hero video:', err));
    } else {
      video.pause();
      this.isHeroVideoPlaying = false;
    }
  }

  selectAreaServe(area: AreaServedItem): void {
    this.contactModel.projectLocation = area.name;
    this.scrollTo('contact');
  }

  exploreWhatWeDo(service: WhatWeDoService): void {
    if (service.title === 'DTCP Approved Plots') {
      this.contactModel.projectType = 'Residential';
      this.contactModel.description = 'Inquiry regarding DTCP Approved Plots and investment options.';
    } else if (service.title === 'Construction') {
      this.contactModel.projectType = 'Residential';
      this.contactModel.description = 'Inquiry regarding end-to-end residential construction.';
    } else if (service.title === 'Interior Design') {
      this.contactModel.projectType = 'Residential';
      this.contactModel.description = 'Inquiry regarding interior design and spatial planning.';
    } else if (service.title === 'Real Estate') {
      this.contactModel.projectType = 'Commercial';
      this.contactModel.description = 'Property guidance and real estate opportunities.';
    } else if (service.title === 'Renovation') {
      this.contactModel.projectType = 'Renovation';
      this.contactModel.description = 'Inquiry regarding home or property renovation upgrades.';
    }
    this.scrollTo('contact');
  }
}
