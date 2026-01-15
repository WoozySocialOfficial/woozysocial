import { useAuth } from '../../contexts/AuthContext';
import { Box, VStack, Text, Button, Icon } from '@chakra-ui/react';
import { FiLock } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

/**
 * FeatureGate Component
 *
 * Conditionally renders children based on feature access for the user's subscription tier.
 * If access is denied, shows an upgrade prompt.
 *
 * @param {string} feature - Feature name to check (from TIER_CONFIG.features)
 * @param {ReactNode} children - Content to render if feature is accessible
 * @param {string} fallbackType - Type of fallback: 'overlay' | 'banner' | 'hide'
 * @param {string} upgradeMessage - Custom message for upgrade prompt
 * @param {string} requiredTier - Minimum tier needed for this feature
 */
const FeatureGate = ({
  feature,
  children,
  fallbackType = 'overlay',
  upgradeMessage = null,
  requiredTier = 'Pro'
}) => {
  const { hasFeatureAccess, subscriptionTier } = useAuth();
  const navigate = useNavigate();

  const hasAccess = hasFeatureAccess(feature);

  // If user has access, render children normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // Default upgrade message
  const defaultMessage = `This feature requires ${requiredTier} tier or higher.`;
  const message = upgradeMessage || defaultMessage;

  // If fallbackType is 'hide', don't render anything
  if (fallbackType === 'hide') {
    return null;
  }

  // If fallbackType is 'banner', show a dismissible banner
  if (fallbackType === 'banner') {
    return (
      <Box
        bg="blue.50"
        border="1px solid"
        borderColor="blue.200"
        borderRadius="md"
        p={4}
        mb={4}
      >
        <VStack spacing={3} align="start">
          <Text fontSize="sm" color="blue.800">
            <Icon as={FiLock} mr={2} />
            {message}
          </Text>
          <Button
            size="sm"
            colorScheme="blue"
            onClick={() => navigate('/pricing')}
          >
            View Plans
          </Button>
        </VStack>
      </Box>
    );
  }

  // Default: 'overlay' - render children with overlay blocking interaction
  return (
    <Box position="relative">
      {/* Blurred/disabled children */}
      <Box
        pointerEvents="none"
        opacity={0.4}
        filter="blur(2px)"
      >
        {children}
      </Box>

      {/* Upgrade overlay */}
      <Box
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        bg="white"
        borderRadius="lg"
        boxShadow="xl"
        p={6}
        textAlign="center"
        zIndex={10}
        maxW="400px"
      >
        <VStack spacing={4}>
          <Icon as={FiLock} boxSize={10} color="blue.500" />
          <Text fontSize="lg" fontWeight="semibold">
            Feature Locked
          </Text>
          <Text fontSize="sm" color="gray.600">
            {message}
          </Text>
          <Button
            colorScheme="blue"
            onClick={() => navigate('/pricing')}
          >
            Upgrade Now
          </Button>
        </VStack>
      </Box>
    </Box>
  );
};

export default FeatureGate;
