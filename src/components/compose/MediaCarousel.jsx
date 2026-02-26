import { useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import './MediaCarousel.css';

export const MediaCarousel = ({
  media,
  platform,
  showControls = true,
  showIndicators = true,
  showCounter = false,
  className = ''
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!media || media.length === 0) {
    return null;
  }

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % media.length);
  };

  const prev = () => {
    setCurrentIndex((prev) => (prev === 0 ? media.length - 1 : prev - 1));
  };

  const goToSlide = (index) => {
    setCurrentIndex(index);
  };

  const currentMedia = media[currentIndex];

  if (!currentMedia) return null;

  return (
    <div className={`media-carousel ${platform} ${className}`}>
      {/* Current media */}
      <div className="carousel-media">
        {currentMedia.type === 'image' ? (
          <img
            src={currentMedia.dataUrl}
            alt={`Media ${currentIndex + 1} of ${media.length}`}
            className="carousel-image"
          />
        ) : (
          <video
            src={currentMedia.dataUrl}
            className="carousel-video"
            controls={false}
            playsInline
          />
        )}
      </div>

      {/* Navigation arrows (only if multiple items and controls enabled) */}
      {media.length > 1 && showControls && (
        <>
          <button
            className="carousel-btn carousel-prev"
            onClick={prev}
            aria-label="Previous image"
            type="button"
          >
            <FaChevronLeft />
          </button>
          <button
            className="carousel-btn carousel-next"
            onClick={next}
            aria-label="Next image"
            type="button"
          >
            <FaChevronRight />
          </button>
        </>
      )}

      {/* Indicators */}
      {media.length > 1 && showIndicators && (
        <div className={`carousel-indicators carousel-indicators-${platform}`}>
          {media.map((_, idx) => (
            <button
              key={idx}
              className={`indicator ${idx === currentIndex ? 'active' : ''}`}
              onClick={() => goToSlide(idx)}
              aria-label={`Go to image ${idx + 1}`}
              type="button"
            />
          ))}
        </div>
      )}

      {/* Counter (for platforms like Instagram) */}
      {media.length > 1 && showCounter && (
        <div className="carousel-counter">
          {currentIndex + 1}/{media.length}
        </div>
      )}
    </div>
  );
};

export default MediaCarousel;
