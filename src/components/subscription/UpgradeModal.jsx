import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Button,
  Box,
  Icon,
  List,
  ListItem,
  ListIcon,
  Badge
} from '@chakra-ui/react';
import { FiLock, FiCheck, FiZap } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SUBSCRIPTION_TIERS, getTierConfig } from '../../utils/constants';

/**
 * UpgradeModal Component
 *
 * A reusable modal that prompts users to upgrade their subscription tier.
 * Shows current plan, recommended plan, and features unlocked.
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {Function} onClose - Callback to close the modal
 * @param {string} featureName - Name of the feature being blocked
 * @param {string} requiredTier - Minimum tier required for this feature
 * @param {string} message - Custom message to display
 */
const UpgradeModal = ({
  isOpen,
  onClose,
  featureName = 'This feature',
  requiredTier = SUBSCRIPTION_TIERS.PRO,
  message = null
}) => {
  const { tierConfig } = useAuth();
  const navigate = useNavigate();

  const requiredTierConfig = getTierConfig(requiredTier);
  const currentTierConfig = tierConfig;

  const defaultMessage = `${featureName} requires ${requiredTierConfig.displayName} or higher.`;

  const handleUpgrade = () => {
    onClose();
    navigate('/pricing');
  };

  // Get feature differences between current and required tier
  const getNewFeatures = () => {
    const currentFeatures = Object.entries(currentTierConfig.features)
      .filter(([_key, value]) => value === true)
      .map(([key]) => key);

    const requiredFeatures = Object.entries(requiredTierConfig.features)
      .filter(([_key, value]) => value === true)
      .map(([key]) => key);

    // Features in required tier but not in current tier
    const newFeatures = requiredFeatures.filter(f => !currentFeatures.includes(f));

    return newFeatures;
  };

  const featureLabels = {
    canPost: 'Create and schedule posts',
    canConnectSocials: 'Connect social media accounts',
    aiFeatures: 'AI-powered features',
    captionSuggestions: 'AI caption suggestions',
    bestTimeToPost: 'Best time to post recommendations',
    postPredictions: 'Post performance predictions',
    approvalWorkflows: 'Client approval workflows',
    brandProfile: 'Brand voice & tone customization',
    analytics: 'Analytics & insights',
    socialInbox: 'Social media inbox'
  };

  const newFeatures = getNewFeatures();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={2}>
            <Icon as={FiLock} color="blue.500" />
            <Text>Upgrade Required</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={5} align="stretch">
            {/* Current vs Required Tier */}
            <Box>
              <HStack spacing={3} mb={3}>
                <Badge colorScheme="gray" fontSize="sm" px={3} py={1}>
                  Current: {currentTierConfig.displayName}
                </Badge>
                <Icon as={FiZap} color="gray.400" />
                <Badge colorScheme="blue" fontSize="sm" px={3} py={1}>
                  Required: {requiredTierConfig.displayName}
                </Badge>
              </HStack>

              <Box
                bg="blue.50"
                border="1px solid"
                borderColor="blue.200"
                borderRadius="md"
                p={4}
              >
                <Text fontSize="sm" color="blue.800">
                  {message || defaultMessage}
                </Text>
              </Box>
            </Box>

            {/* Features Unlocked */}
            {newFeatures.length > 0 && (
              <Box>
                <Text fontWeight="semibold" mb={3}>
                  Unlock with {requiredTierConfig.displayName}:
                </Text>
                <List spacing={2}>
                  {newFeatures.slice(0, 5).map((feature) => (
                    <ListItem key={feature} fontSize="sm">
                      <ListIcon as={FiCheck} color="green.500" />
                      {featureLabels[feature] || feature}
                    </ListItem>
                  ))}
                </List>
                {newFeatures.length > 5 && (
                  <Text fontSize="xs" color="gray.600" mt={2}>
                    + {newFeatures.length - 5} more features
                  </Text>
                )}
              </Box>
            )}

            {/* Pricing Info */}
            <Box
              bg="gray.50"
              borderRadius="md"
              p={4}
              textAlign="center"
            >
              <Text fontSize="2xl" fontWeight="bold" color="blue.600">
                €{requiredTierConfig.price}
                <Text as="span" fontSize="sm" fontWeight="normal" color="gray.600">
                  /month
                </Text>
              </Text>
              <Text fontSize="xs" color="gray.600" mt={1}>
                Upgrade today and unlock all features
              </Text>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Maybe Later
          </Button>
          <Button colorScheme="blue" onClick={handleUpgrade}>
            View Plans & Upgrade
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UpgradeModal;
