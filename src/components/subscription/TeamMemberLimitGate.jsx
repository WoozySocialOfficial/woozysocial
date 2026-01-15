import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  Text,
  Button,
  Box,
  Icon,
  useDisclosure
} from '@chakra-ui/react';
import { FiLock, FiUsers } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_TIERS } from '../../utils/constants';

/**
 * TeamMemberLimitGate Component
 *
 * Wraps buttons/actions that invite team members and enforces tier limits.
 * Shows upgrade modal when limit is reached.
 *
 * @param {ReactNode} children - Button or trigger element (will be cloned with onClick handler)
 * @param {Function} onAllowed - Callback to execute when team member invite is allowed
 */
const TeamMemberLimitGate = ({ children, onAllowed }) => {
  const { subscriptionTier, canInviteNewMember, teamMemberLimit, tierConfig } = useAuth();
  const { workspaceMembers } = useWorkspace();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const navigate = useNavigate();

  const currentMemberCount = workspaceMembers?.length || 0;
  const canInvite = canInviteNewMember(currentMemberCount);

  const handleClick = () => {
    if (canInvite) {
      // User can invite member - execute callback
      if (onAllowed) onAllowed();
    } else {
      // User hit limit - show upgrade modal
      onOpen();
    }
  };

  // Clone the child element and add our onClick handler
  const childrenWithProps = typeof children === 'function'
    ? children({ onClick: handleClick, disabled: false })
    : children && children.type
      ? { ...children, props: { ...children.props, onClick: handleClick } }
      : children;

  const getUpgradeRecommendation = () => {
    switch (subscriptionTier) {
      case SUBSCRIPTION_TIERS.FREE:
        return {
          tier: 'Pro',
          limit: 3,
          message: 'Upgrade to Pro tier to invite team members (up to 3 members).'
        };
      case SUBSCRIPTION_TIERS.SOLO:
        return {
          tier: 'Pro',
          limit: 3,
          message: 'Solo tier does not include team management. Upgrade to Pro tier to invite up to 3 team members.'
        };
      case SUBSCRIPTION_TIERS.PRO:
        return {
          tier: 'Pro Plus',
          limit: Infinity,
          message: `You've reached your team member limit (${teamMemberLimit}). Upgrade to Pro Plus for unlimited team members.`
        };
      case SUBSCRIPTION_TIERS.PRO_PLUS:
      case SUBSCRIPTION_TIERS.AGENCY:
        return {
          tier: 'Current',
          limit: Infinity,
          message: 'You have unlimited team members.',
          unlimited: true
        };
      default:
        return {
          tier: 'Pro',
          limit: 3,
          message: 'Upgrade to invite team members.'
        };
    }
  };

  const upgradeInfo = getUpgradeRecommendation();

  return (
    <>
      {childrenWithProps}

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Icon as={FiLock} mr={2} color="blue.500" />
            Team Member Limit Reached
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="start">
              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Current Plan: {tierConfig.displayName}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Team Members: {currentMemberCount} / {teamMemberLimit === Infinity ? '∞' : teamMemberLimit}
                </Text>
              </Box>

              <Box
                bg="blue.50"
                border="1px solid"
                borderColor="blue.200"
                borderRadius="md"
                p={4}
                w="full"
              >
                <Text fontSize="sm" color="blue.800">
                  {upgradeInfo.message}
                </Text>
              </Box>

              {!upgradeInfo.unlimited && (
                <VStack spacing={2} align="start" w="full">
                  <Text fontSize="sm" fontWeight="semibold">
                    <Icon as={FiUsers} mr={1} color="blue.500" />
                    Upgrade to {upgradeInfo.tier}
                  </Text>
                  <Text fontSize="xs" color="gray.600">
                    Get access to {upgradeInfo.limit === Infinity ? 'unlimited' : `up to ${upgradeInfo.limit}`} team members and collaboration features.
                  </Text>
                </VStack>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            {!upgradeInfo.unlimited && (
              <Button
                colorScheme="blue"
                onClick={() => {
                  onClose();
                  navigate('/pricing');
                }}
              >
                View Plans
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default TeamMemberLimitGate;
