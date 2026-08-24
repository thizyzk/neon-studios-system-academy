import javax.swing.DefaultListCellRenderer;
import javax.swing.DefaultListModel;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComboBox;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.JTabbedPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.ListSelectionModel;
import javax.swing.SpinnerNumberModel;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.SwingWorker;
import javax.swing.Timer;
import javax.swing.UIManager;
import javax.swing.border.EmptyBorder;
import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Cursor;
import java.awt.Desktop;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.Insets;
import java.awt.LinearGradientPaint;
import java.awt.Point;
import java.awt.RenderingHints;
import java.awt.Toolkit;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class RobloxCubeGui extends JFrame {
    private static final Color INK = new Color(232, 239, 233);
    private static final Color MUTED = new Color(167, 181, 172);
    private static final Color PANEL = new Color(19, 28, 27, 218);
    private static final Color PANEL_SOFT = new Color(33, 50, 47, 215);
    private static final Color FIELD_BG = new Color(8, 14, 14, 230);
    private static final Color ACCENT = new Color(123, 225, 183);
    private static final Color ACCENT_2 = new Color(235, 206, 134);
    private static final long DEFAULT_ESTIMATE_MS = 5L * 60L * 1000L;

    private final Path projectRoot;
    private final JTextArea logArea = new JTextArea();
    private final JLabel statusLabel = new JLabel("Pronto");
    private final JLabel queueStatusLabel = new JLabel("Fila vazia");
    private final JLabel estimateLabel = new JLabel("Media: aguardando primeira geracao");

    private final DefaultListModel<QueueItem> queueModel = new DefaultListModel<QueueItem>();
    private final JList<QueueItem> queueList = new JList<QueueItem>(queueModel);
    private final JTextField promptField = new JTextField();
    private final JTextField nameField = new JTextField();
    private final JSpinner resolutionSpinner = new JSpinner(new SpinnerNumberModel(4.0, 2.0, 8.0, 0.5));
    private final JSpinner xSpinner = new JSpinner(new SpinnerNumberModel(1.4, 0.2, 5.0, 0.1));
    private final JSpinner ySpinner = new JSpinner(new SpinnerNumberModel(0.8, 0.2, 5.0, 0.1));
    private final JSpinner zSpinner = new JSpinner(new SpinnerNumberModel(1.0, 0.2, 5.0, 0.1));
    private final JCheckBox postprocessCheckBox = new JCheckBox("Pos-processar malha");
    private final JComboBox<String> presetCombo = new JComboBox<String>(new String[]{
            "Fardo de algodao",
            "Flor de algodao",
            "Maquina de processamento",
            "Esteira",
            "Livre"
    });

    private final Preview3DPanel previewPanel = new Preview3DPanel();
    private final JComboBox<String> texturePresetCombo = new JComboBox<String>(new String[]{
            "Algodao quente",
            "Algodao limpo",
            "Juta / faixa",
            "Metal verde",
            "Borracha escura"
    });
    private final JComboBox<String> previewShapeCombo = new JComboBox<String>(new String[]{
            "Fardo",
            "Algodao",
            "Maquina"
    });
    private final JLabel previewInfoLabel = new JLabel("Preview local 30 FPS");

    private final GlowButton addQueueButton = new GlowButton("Adicionar a fila", true);
    private final GlowButton addPlaylistButton = new GlowButton("Adicionar playlist", false);
    private final GlowButton startQueueButton = new GlowButton("Iniciar fila", true);
    private final GlowButton stopQueueButton = new GlowButton("Parar atual", false);
    private final GlowButton removeQueueButton = new GlowButton("Remover", false);
    private final GlowButton clearQueueButton = new GlowButton("Limpar fila", false);
    private final GlowButton generatePolishedButton = new GlowButton("Gerar modelos polidos", false);
    private final GlowButton openGeneratedButton = new GlowButton("Abrir saida", false);

    private Process runningProcess;
    private boolean queueRunning = false;
    private QueueItem currentItem;
    private long averageDurationMs = 0L;
    private int completedCount = 0;
    private Point dragStart;
    private Timer queueTimer;

    public static void main(String[] args) {
        SwingUtilities.invokeLater(new Runnable() {
            @Override
            public void run() {
                try {
                    UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                } catch (Exception ignored) {
                }
                Path root = args.length > 0 ? Paths.get(args[0]) : Paths.get("").toAbsolutePath();
                new RobloxCubeGui(root).setVisible(true);
            }
        });
    }

    public RobloxCubeGui(Path projectRoot) {
        this.projectRoot = projectRoot.toAbsolutePath().normalize();
        setTitle("RobloxCube - Cotton Fabric Tycoon");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setUndecorated(true);
        setBackground(new Color(10, 16, 16));
        setMinimumSize(new Dimension(1160, 790));
        setSize(new Dimension(1220, 820));
        setLocationRelativeTo(null);
        buildUi();
        installLightCursor();
        installQueueTimer();
        applyPreset();
        appendLog("Projeto: " + this.projectRoot);
        appendLog("Fila pronta. Adicione prompts e clique em Iniciar fila.");
    }

    private void buildUi() {
        AnimatedBackgroundPanel background = new AnimatedBackgroundPanel();
        background.setLayout(new BorderLayout());
        background.setBorder(new EmptyBorder(16, 16, 16, 16));
        setContentPane(background);

        GlassPanel shell = new GlassPanel(28, PANEL);
        shell.setLayout(new BorderLayout(16, 16));
        shell.setBorder(new EmptyBorder(18, 20, 20, 20));
        background.add(shell, BorderLayout.CENTER);
        shell.add(createTitleBar(), BorderLayout.NORTH);

        JTabbedPane tabs = new JTabbedPane();
        tabs.setOpaque(false);
        tabs.setFont(new Font("Segoe UI", Font.BOLD, 13));
        tabs.addTab("1. Mesh / Queue", createMeshTab());
        tabs.addTab("2. Textura / Preview 3D", createTextureTab());
        tabs.addChangeListener(e -> previewPanel.setActive(tabs.getSelectedIndex() == 1));
        previewPanel.setActive(false);
        shell.add(tabs, BorderLayout.CENTER);

        JPanel bottom = transparentFlow(FlowLayout.RIGHT);
        GlowButton openProjectButton = new GlowButton("Abrir projeto", false);
        GlowButton clearLogButton = new GlowButton("Limpar log", false);
        bottom.add(openProjectButton);
        bottom.add(clearLogButton);
        shell.add(bottom, BorderLayout.SOUTH);

        openProjectButton.addActionListener(e -> openPath(projectRoot));
        clearLogButton.addActionListener(e -> logArea.setText(""));
    }

    private JPanel createTitleBar() {
        JPanel titleBar = new JPanel(new BorderLayout());
        titleBar.setOpaque(false);
        titleBar.addMouseListener(new MouseAdapter() {
            @Override
            public void mousePressed(MouseEvent event) {
                dragStart = event.getPoint();
            }
        });
        titleBar.addMouseMotionListener(new MouseAdapter() {
            @Override
            public void mouseDragged(MouseEvent event) {
                Point frameLocation = getLocation();
                setLocation(frameLocation.x + event.getX() - dragStart.x, frameLocation.y + event.getY() - dragStart.y);
            }
        });

        JPanel titleText = new JPanel(new GridBagLayout());
        titleText.setOpaque(false);
        GridBagConstraints c = new GridBagConstraints();
        c.gridx = 0;
        c.gridy = 0;
        c.anchor = GridBagConstraints.WEST;
        JLabel title = new JLabel("RobloxCube Asset Studio");
        title.setForeground(INK);
        title.setFont(new Font("Segoe UI", Font.BOLD, 30));
        titleText.add(title, c);
        c.gridy = 1;
        JLabel subtitle = new JLabel("Fila de prompts, texturas e preview local em 30 FPS");
        subtitle.setForeground(MUTED);
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        titleText.add(subtitle, c);
        titleBar.add(titleText, BorderLayout.WEST);

        JPanel actions = transparentFlow(FlowLayout.RIGHT);
        actions.add(statusPill());
        GlowButton minimize = new GlowButton("-", false);
        GlowButton close = new GlowButton("x", false);
        minimize.setPreferredSize(new Dimension(42, 32));
        close.setPreferredSize(new Dimension(42, 32));
        minimize.addActionListener(e -> setState(JFrame.ICONIFIED));
        close.addActionListener(e -> dispose());
        actions.add(minimize);
        actions.add(close);
        titleBar.add(actions, BorderLayout.EAST);
        return titleBar;
    }

    private JPanel createMeshTab() {
        JPanel tab = new JPanel(new GridBagLayout());
        tab.setOpaque(false);
        GridBagConstraints gbc = baseGbc();

        GlassPanel promptCard = new GlassPanel(22, PANEL_SOFT);
        promptCard.setLayout(new GridBagLayout());
        promptCard.setBorder(new EmptyBorder(18, 18, 18, 18));
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 0.62;
        gbc.weighty = 0.0;
        gbc.gridwidth = 1;
        gbc.fill = GridBagConstraints.BOTH;
        tab.add(promptCard, gbc);
        buildPromptComposer(promptCard);

        GlassPanel queueCard = new GlassPanel(22, new Color(16, 25, 26, 222));
        queueCard.setLayout(new BorderLayout(12, 12));
        queueCard.setBorder(new EmptyBorder(18, 18, 18, 18));
        gbc.gridx = 1;
        gbc.gridy = 0;
        gbc.weightx = 0.38;
        gbc.weighty = 0.0;
        tab.add(queueCard, gbc);
        buildQueueCard(queueCard);

        GlassPanel logCard = new GlassPanel(22, new Color(8, 13, 14, 226));
        logCard.setLayout(new BorderLayout(10, 10));
        logCard.setBorder(new EmptyBorder(16, 16, 16, 16));
        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 2;
        gbc.weightx = 1.0;
        gbc.weighty = 1.0;
        tab.add(logCard, gbc);
        buildLogCard(logCard);

        return tab;
    }

    private JPanel createTextureTab() {
        JPanel tab = new JPanel(new GridBagLayout());
        tab.setOpaque(false);
        GridBagConstraints gbc = baseGbc();

        GlassPanel textureCard = new GlassPanel(22, PANEL_SOFT);
        textureCard.setLayout(new GridBagLayout());
        textureCard.setBorder(new EmptyBorder(18, 18, 18, 18));
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.weightx = 0.36;
        gbc.weighty = 1.0;
        gbc.fill = GridBagConstraints.BOTH;
        tab.add(textureCard, gbc);
        buildTextureControls(textureCard);

        GlassPanel previewCard = new GlassPanel(22, new Color(8, 13, 14, 226));
        previewCard.setLayout(new BorderLayout(10, 10));
        previewCard.setBorder(new EmptyBorder(16, 16, 16, 16));
        gbc.gridx = 1;
        gbc.gridy = 0;
        gbc.weightx = 0.64;
        tab.add(previewCard, gbc);
        buildPreviewCard(previewCard);

        return tab;
    }

    private void buildPromptComposer(JPanel card) {
        GridBagConstraints gbc = baseGbc();
        addSectionTitle(card, gbc, 0, "Geracao de mesh", "Monte prompts e envie para a fila");
        styleCombo(presetCombo);
        styleField(promptField);
        styleField(nameField);
        styleSpinner(resolutionSpinner);
        styleSpinner(xSpinner);
        styleSpinner(ySpinner);
        styleSpinner(zSpinner);
        styleCheckBox(postprocessCheckBox);

        addFormLabel(card, gbc, 1, "Preset");
        addFormComponent(card, gbc, 1, 1, 1, presetCombo);
        addFormLabel(card, gbc, 1, "Nome", 2);
        addFormComponent(card, gbc, 1, 3, 1, nameField);
        addFormLabel(card, gbc, 2, "Prompt");
        addFormComponent(card, gbc, 2, 1, 3, promptField);
        addFormLabel(card, gbc, 3, "Resolucao");
        addFormComponent(card, gbc, 3, 1, 1, resolutionSpinner);

        JPanel sizeRow = transparentFlow(FlowLayout.LEFT);
        sizeRow.add(smallLabel("X"));
        sizeRow.add(xSpinner);
        sizeRow.add(smallLabel("Y"));
        sizeRow.add(ySpinner);
        sizeRow.add(smallLabel("Z"));
        sizeRow.add(zSpinner);
        addFormLabel(card, gbc, 3, "Tamanho", 2);
        addFormComponent(card, gbc, 3, 3, 1, sizeRow);

        JPanel optionRow = transparentFlow(FlowLayout.LEFT);
        optionRow.add(postprocessCheckBox);
        addFormLabel(card, gbc, 4, "Opcoes");
        addFormComponent(card, gbc, 4, 1, 3, optionRow);

        JPanel buttonRow = transparentFlow(FlowLayout.LEFT);
        buttonRow.add(addQueueButton);
        buttonRow.add(addPlaylistButton);
        buttonRow.add(generatePolishedButton);
        buttonRow.add(openGeneratedButton);
        gbc.gridx = 1;
        gbc.gridy = 5;
        gbc.gridwidth = 3;
        gbc.weightx = 1;
        card.add(buttonRow, gbc);

        presetCombo.addActionListener(e -> applyPreset());
        addQueueButton.addActionListener(e -> addCurrentPromptToQueue());
        addPlaylistButton.addActionListener(e -> addPromptPlaylist());
        generatePolishedButton.addActionListener(e -> runPolishedGeneration());
        openGeneratedButton.addActionListener(e -> openPath(projectRoot.resolve("generated-models")));
    }

    private void buildQueueCard(JPanel card) {
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel title = new JLabel("Queue / Playlist");
        title.setForeground(INK);
        title.setFont(new Font("Segoe UI", Font.BOLD, 17));
        queueStatusLabel.setForeground(MUTED);
        queueStatusLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        header.add(title, BorderLayout.WEST);
        header.add(queueStatusLabel, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);

        queueList.setOpaque(false);
        queueList.setForeground(INK);
        queueList.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        queueList.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        queueList.setCellRenderer(new QueueCellRenderer());
        JScrollPane pane = new JScrollPane(queueList);
        pane.setOpaque(false);
        pane.getViewport().setOpaque(false);
        pane.setBorder(javax.swing.BorderFactory.createLineBorder(new Color(123, 225, 183, 42)));
        card.add(pane, BorderLayout.CENTER);

        JPanel actions = new JPanel(new GridBagLayout());
        actions.setOpaque(false);
        GridBagConstraints gbc = baseGbc();
        gbc.gridx = 0;
        gbc.gridy = 0;
        gbc.gridwidth = 2;
        gbc.weightx = 1;
        estimateLabel.setForeground(ACCENT_2);
        estimateLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        actions.add(estimateLabel, gbc);
        gbc.gridwidth = 1;
        gbc.gridy = 1;
        actions.add(startQueueButton, gbc);
        gbc.gridx = 1;
        actions.add(stopQueueButton, gbc);
        gbc.gridx = 0;
        gbc.gridy = 2;
        actions.add(removeQueueButton, gbc);
        gbc.gridx = 1;
        actions.add(clearQueueButton, gbc);
        card.add(actions, BorderLayout.SOUTH);

        startQueueButton.addActionListener(e -> startQueue());
        stopQueueButton.addActionListener(e -> stopCurrentGeneration());
        removeQueueButton.addActionListener(e -> removeSelectedQueueItem());
        clearQueueButton.addActionListener(e -> clearQueue());
    }

    private void buildTextureControls(JPanel card) {
        GridBagConstraints gbc = baseGbc();
        addSectionTitle(card, gbc, 0, "Textura", "Aplique material e visualize localmente");
        styleCombo(texturePresetCombo);
        styleCombo(previewShapeCombo);

        addFormLabel(card, gbc, 1, "Modelo preview");
        addFormComponent(card, gbc, 1, 1, 1, previewShapeCombo);
        addFormLabel(card, gbc, 2, "Material");
        addFormComponent(card, gbc, 2, 1, 1, texturePresetCombo);

        JPanel buttons = transparentFlow(FlowLayout.LEFT);
        GlowButton applyPreviewButton = new GlowButton("Aplicar no preview", true);
        GlowButton writeMtlButton = new GlowButton("Criar material .mtl", false);
        GlowButton openFolderButton = new GlowButton("Abrir saida", false);
        buttons.add(applyPreviewButton);
        buttons.add(writeMtlButton);
        buttons.add(openFolderButton);
        gbc.gridx = 0;
        gbc.gridy = 3;
        gbc.gridwidth = 2;
        gbc.weightx = 1;
        card.add(buttons, gbc);

        JTextArea helper = new JTextArea("Fluxo recomendado:\n1. Gere a mesh na aba 1.\n2. Escolha um material aqui.\n3. Veja o resultado no preview 30 FPS.\n4. Clique em Criar material .mtl para gerar um preset simples para OBJs.");
        helper.setEditable(false);
        helper.setOpaque(false);
        helper.setForeground(MUTED);
        helper.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        helper.setLineWrap(true);
        helper.setWrapStyleWord(true);
        gbc.gridy = 4;
        gbc.weighty = 1;
        gbc.fill = GridBagConstraints.BOTH;
        card.add(helper, gbc);

        previewShapeCombo.addActionListener(e -> previewPanel.setShape(String.valueOf(previewShapeCombo.getSelectedItem())));
        texturePresetCombo.addActionListener(e -> previewPanel.setMaterial(String.valueOf(texturePresetCombo.getSelectedItem())));
        applyPreviewButton.addActionListener(e -> {
            previewPanel.setShape(String.valueOf(previewShapeCombo.getSelectedItem()));
            previewPanel.setMaterial(String.valueOf(texturePresetCombo.getSelectedItem()));
            appendLog("Preview atualizado com material: " + texturePresetCombo.getSelectedItem());
        });
        writeMtlButton.addActionListener(e -> writeMaterialPreset());
        openFolderButton.addActionListener(e -> openPath(projectRoot.resolve("generated-models")));
    }

    private void buildPreviewCard(JPanel card) {
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel title = new JLabel("Visualizacao 3D local");
        title.setForeground(INK);
        title.setFont(new Font("Segoe UI", Font.BOLD, 17));
        previewInfoLabel.setForeground(ACCENT);
        previewInfoLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        header.add(title, BorderLayout.WEST);
        header.add(previewInfoLabel, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);
        card.add(previewPanel, BorderLayout.CENTER);
    }

    private void buildLogCard(JPanel card) {
        JPanel header = new JPanel(new BorderLayout());
        header.setOpaque(false);
        JLabel label = new JLabel("Log");
        label.setForeground(INK);
        label.setFont(new Font("Segoe UI", Font.BOLD, 15));
        JLabel hint = new JLabel("Fila sequencial com media de tempo");
        hint.setForeground(MUTED);
        hint.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        header.add(label, BorderLayout.WEST);
        header.add(hint, BorderLayout.EAST);
        card.add(header, BorderLayout.NORTH);

        logArea.setEditable(false);
        logArea.setLineWrap(true);
        logArea.setWrapStyleWord(true);
        logArea.setOpaque(false);
        logArea.setForeground(new Color(204, 226, 212));
        logArea.setCaretColor(ACCENT);
        logArea.setFont(new Font("Consolas", Font.PLAIN, 13));
        JScrollPane logPane = new JScrollPane(logArea);
        logPane.setOpaque(false);
        logPane.getViewport().setOpaque(false);
        logPane.setBorder(javax.swing.BorderFactory.createLineBorder(new Color(123, 225, 183, 42)));
        card.add(logPane, BorderLayout.CENTER);
    }

    private void addCurrentPromptToQueue() {
        String prompt = promptField.getText().trim();
        String name = nameField.getText().trim();
        if (prompt.isEmpty() || name.isEmpty()) {
            showError("Preencha nome e prompt antes de adicionar.");
            return;
        }
        QueueItem item = new QueueItem(
                name,
                prompt,
                ((Number) resolutionSpinner.getValue()).doubleValue(),
                ((Number) xSpinner.getValue()).doubleValue(),
                ((Number) ySpinner.getValue()).doubleValue(),
                ((Number) zSpinner.getValue()).doubleValue(),
                postprocessCheckBox.isSelected()
        );
        queueModel.addElement(item);
        updateQueueLabels();
        appendLog("Adicionado a fila: " + item.name);
    }

    private void addPromptPlaylist() {
        QueueItem[] playlist = new QueueItem[]{
                new QueueItem("cotton-bale-playlist", "stylized realistic compressed cotton bale with jute straps, clean Roblox asset, readable silhouette", 4.0, 1.6, 0.9, 1.0, false),
                new QueueItem("cotton-boll-playlist", "stylized realistic cotton boll flower on a brown stem, clean Roblox asset, separated soft lobes", 4.0, 1.1, 0.9, 1.0, false),
                new QueueItem("cotton-machine-playlist", "stylized realistic cotton processing machine for a Roblox tycoon, rollers, metal chute, simple readable silhouette", 4.0, 1.4, 1.0, 1.0, false),
                new QueueItem("conveyor-playlist", "stylized realistic short factory conveyor belt for Roblox tycoon, rubber belt, metal frame", 4.0, 2.0, 0.8, 0.5, false)
        };
        for (QueueItem item : playlist) {
            queueModel.addElement(item);
        }
        updateQueueLabels();
        appendLog("Playlist adicionada: " + playlist.length + " prompts.");
    }

    private void startQueue() {
        if (queueRunning) {
            showError("A fila ja esta rodando.");
            return;
        }
        queueRunning = true;
        appendLog("Fila iniciada.");
        runNextQueueItem();
    }

    private void runNextQueueItem() {
        currentItem = nextPendingItem();
        if (currentItem == null) {
            queueRunning = false;
            currentItem = null;
            statusLabel.setText("Pronto");
            statusLabel.setForeground(ACCENT);
            appendLog("Fila finalizada.");
            updateQueueLabels();
            setButtonsEnabled(true);
            return;
        }

        currentItem.status = "Gerando";
        currentItem.startedAt = System.currentTimeMillis();
        queueList.repaint();
        updateQueueLabels();
        runQueueItem(currentItem);
    }

    private QueueItem nextPendingItem() {
        for (int i = 0; i < queueModel.size(); i++) {
            QueueItem item = queueModel.get(i);
            if ("Aguardando".equals(item.status)) {
                return item;
            }
        }
        return null;
    }

    private void runQueueItem(QueueItem item) {
        Path script = projectRoot.resolve("scripts").resolve("robloxcube-generate.ps1");
        if (!Files.exists(script)) {
            showError("Script nao encontrado: " + script);
            queueRunning = false;
            return;
        }

        List<String> command = new ArrayList<String>();
        command.add("powershell.exe");
        command.add("-NoProfile");
        command.add("-ExecutionPolicy");
        command.add("Bypass");
        command.add("-File");
        command.add(script.toString());
        command.add("-Prompt");
        command.add(item.prompt);
        command.add("-Name");
        command.add(item.name);
        command.add("-ResolutionBase");
        command.add(String.valueOf(item.resolution));
        command.add("-BoundingBoxXyz");
        command.add(String.valueOf(item.x));
        command.add(String.valueOf(item.y));
        command.add(String.valueOf(item.z));
        if (item.postprocess) {
            command.add("-Postprocess");
        }

        setButtonsEnabled(false);
        statusLabel.setText("Gerando");
        statusLabel.setForeground(ACCENT_2);
        appendLog("");
        appendLog("Gerando " + item.name + " | estimativa: " + formatDuration(estimateFor(item)));
        appendLog("Think: preparando mesh e tokens 3D...");

        SwingWorker<Integer, String> worker = new SwingWorker<Integer, String>() {
            @Override
            protected Integer doInBackground() throws Exception {
                ProcessBuilder builder = new ProcessBuilder(command);
                builder.directory(projectRoot.toFile());
                builder.redirectErrorStream(true);
                runningProcess = builder.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(runningProcess.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) {
                    publish(line);
                }
                return runningProcess.waitFor();
            }

            @Override
            protected void process(List<String> chunks) {
                for (String line : chunks) {
                    appendLog(line);
                }
            }

            @Override
            protected void done() {
                try {
                    int exitCode = get();
                    long duration = System.currentTimeMillis() - item.startedAt;
                    if (exitCode == 0) {
                        item.status = "Concluido";
                        item.durationMs = duration;
                        registerDuration(duration);
                        appendLog("Concluido " + item.name + " em " + formatDuration(duration) + ".");
                    } else {
                        item.status = "Erro";
                        appendLog("Erro em " + item.name + " | codigo " + exitCode);
                    }
                } catch (Exception ex) {
                    item.status = "Erro";
                    appendLog("Erro: " + ex.getMessage());
                    showError(ex.getMessage());
                } finally {
                    runningProcess = null;
                    queueList.repaint();
                    setButtonsEnabled(true);
                    updateQueueLabels();
                    if (queueRunning) {
                        runNextQueueItem();
                    }
                }
            }
        };
        worker.execute();
    }

    private void stopCurrentGeneration() {
        queueRunning = false;
        if (runningProcess != null && runningProcess.isAlive()) {
            runningProcess.destroy();
            appendLog("Processo atual solicitado para parar.");
        }
        if (currentItem != null && "Gerando".equals(currentItem.status)) {
            currentItem.status = "Parado";
            queueList.repaint();
        }
        setButtonsEnabled(true);
        statusLabel.setText("Parado");
        statusLabel.setForeground(new Color(255, 180, 120));
        updateQueueLabels();
    }

    private void removeSelectedQueueItem() {
        int index = queueList.getSelectedIndex();
        if (index >= 0) {
            QueueItem item = queueModel.get(index);
            if ("Gerando".equals(item.status)) {
                showError("Nao remova o item que esta gerando. Use Parar atual.");
                return;
            }
            queueModel.remove(index);
            updateQueueLabels();
        }
    }

    private void clearQueue() {
        if (runningProcess != null && runningProcess.isAlive()) {
            showError("Pare a geracao atual antes de limpar a fila.");
            return;
        }
        queueModel.clear();
        queueRunning = false;
        currentItem = null;
        updateQueueLabels();
    }

    private void runPolishedGeneration() {
        Path script = projectRoot.resolve("scripts").resolve("create-polished-roblox-assets.ps1");
        if (!Files.exists(script)) {
            showError("Script nao encontrado: " + script);
            return;
        }
        QueueItem item = new QueueItem("polished-assets", "Geracao procedural dos modelos polidos via Blender", 0, 0, 0, 0, false);
        item.status = "Gerando";
        currentItem = item;
        setButtonsEnabled(false);
        statusLabel.setText("Gerando");
        statusLabel.setForeground(ACCENT_2);
        appendLog("Gerando modelos polidos via Blender...");
        runSimpleCommand(script, item);
    }

    private void runSimpleCommand(Path script, QueueItem item) {
        List<String> command = new ArrayList<String>();
        command.add("powershell.exe");
        command.add("-NoProfile");
        command.add("-ExecutionPolicy");
        command.add("Bypass");
        command.add("-File");
        command.add(script.toString());
        item.startedAt = System.currentTimeMillis();

        SwingWorker<Integer, String> worker = new SwingWorker<Integer, String>() {
            @Override
            protected Integer doInBackground() throws Exception {
                ProcessBuilder builder = new ProcessBuilder(command);
                builder.directory(projectRoot.toFile());
                builder.redirectErrorStream(true);
                runningProcess = builder.start();
                BufferedReader reader = new BufferedReader(new InputStreamReader(runningProcess.getInputStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) {
                    publish(line);
                }
                return runningProcess.waitFor();
            }

            @Override
            protected void process(List<String> chunks) {
                for (String line : chunks) {
                    appendLog(line);
                }
            }

            @Override
            protected void done() {
                try {
                    int exit = get();
                    appendLog("Modelos polidos finalizados com codigo: " + exit);
                    statusLabel.setText(exit == 0 ? "Pronto" : "Erro");
                    statusLabel.setForeground(exit == 0 ? ACCENT : new Color(255, 122, 122));
                } catch (Exception ex) {
                    appendLog("Erro: " + ex.getMessage());
                } finally {
                    runningProcess = null;
                    setButtonsEnabled(true);
                }
            }
        };
        worker.execute();
    }

    private void writeMaterialPreset() {
        try {
            Path outDir = projectRoot.resolve("generated-models").resolve("texture-presets");
            Files.createDirectories(outDir);
            String preset = String.valueOf(texturePresetCombo.getSelectedItem());
            Color color = previewPanel.getMaterialColor();
            String materialName = preset.toLowerCase().replace(" ", "_").replace("/", "_");
            Path mtl = outDir.resolve(materialName + ".mtl");
            String content = "newmtl " + materialName + "\n" +
                    "Ka " + rgb(color, 0.55) + "\n" +
                    "Kd " + rgb(color, 1.0) + "\n" +
                    "Ks 0.120 0.120 0.120\n" +
                    "Ns 24.000\n" +
                    "d 1.0\n";
            Files.write(mtl, content.getBytes(StandardCharsets.UTF_8));
            appendLog("Material criado: " + mtl);
            openPath(outDir);
        } catch (IOException ex) {
            showError("Nao consegui criar material: " + ex.getMessage());
        }
    }

    private String rgb(Color color, double scale) {
        return String.format(java.util.Locale.US, "%.3f %.3f %.3f",
                Math.min(1.0, color.getRed() / 255.0 * scale),
                Math.min(1.0, color.getGreen() / 255.0 * scale),
                Math.min(1.0, color.getBlue() / 255.0 * scale));
    }

    private void installQueueTimer() {
        queueTimer = new Timer(1000, e -> updateQueueLabels());
        queueTimer.start();
    }

    private void updateQueueLabels() {
        int pending = 0;
        int done = 0;
        int errors = 0;
        for (int i = 0; i < queueModel.size(); i++) {
            QueueItem item = queueModel.get(i);
            if ("Aguardando".equals(item.status)) {
                pending++;
            } else if ("Concluido".equals(item.status)) {
                done++;
            } else if ("Erro".equals(item.status)) {
                errors++;
            }
        }
        if (currentItem != null && "Gerando".equals(currentItem.status)) {
            long elapsed = System.currentTimeMillis() - currentItem.startedAt;
            long estimate = estimateFor(currentItem);
            long remaining = Math.max(0, estimate - elapsed);
            queueStatusLabel.setText("Gerando " + currentItem.name + " | " + formatDuration(remaining) + " restantes");
        } else {
            queueStatusLabel.setText(pending + " aguardando | " + done + " concluidos | " + errors + " erros");
        }
        long avg = averageDurationMs > 0 ? averageDurationMs : DEFAULT_ESTIMATE_MS;
        estimateLabel.setText("Media: " + formatDuration(avg) + " por modelo | Proximo: " + formatDuration(avg));
    }

    private long estimateFor(QueueItem item) {
        if (averageDurationMs > 0) {
            return averageDurationMs;
        }
        if (item.resolution > 4.0) {
            return DEFAULT_ESTIMATE_MS + 2L * 60L * 1000L;
        }
        return DEFAULT_ESTIMATE_MS;
    }

    private void registerDuration(long durationMs) {
        completedCount++;
        if (averageDurationMs == 0) {
            averageDurationMs = durationMs;
        } else {
            averageDurationMs = Math.round((averageDurationMs * (completedCount - 1) + durationMs) / (double) completedCount);
        }
    }

    private String formatDuration(long ms) {
        Duration d = Duration.ofMillis(Math.max(0, ms));
        long minutes = d.toMinutes();
        long seconds = d.minusMinutes(minutes).getSeconds();
        if (minutes <= 0) {
            return seconds + "s";
        }
        return minutes + "min " + seconds + "s";
    }

    private void setButtonsEnabled(boolean enabled) {
        addQueueButton.setEnabled(enabled);
        addPlaylistButton.setEnabled(enabled);
        startQueueButton.setEnabled(enabled);
        generatePolishedButton.setEnabled(enabled);
    }

    private void applyPreset() {
        String preset = String.valueOf(presetCombo.getSelectedItem());
        if ("Fardo de algodao".equals(preset)) {
            promptField.setText("stylized realistic compressed cotton bale with jute straps, clean Roblox asset, readable silhouette");
            nameField.setText("cotton-bale");
            setBox(1.6, 0.9, 1.0);
        } else if ("Flor de algodao".equals(preset)) {
            promptField.setText("stylized realistic cotton boll flower on a small brown stem, clean Roblox asset");
            nameField.setText("cotton-boll");
            setBox(1.1, 0.9, 1.0);
        } else if ("Maquina de processamento".equals(preset)) {
            promptField.setText("stylized realistic cotton processing machine for a Roblox tycoon, rollers, metal chute, simple readable silhouette");
            nameField.setText("cotton-machine");
            setBox(1.4, 1.0, 1.0);
        } else if ("Esteira".equals(preset)) {
            promptField.setText("stylized realistic short factory conveyor belt for Roblox tycoon, rubber belt, metal frame");
            nameField.setText("conveyor");
            setBox(2.0, 0.8, 0.5);
        }
    }

    private void setBox(double x, double y, double z) {
        xSpinner.setValue(x);
        ySpinner.setValue(y);
        zSpinner.setValue(z);
        resolutionSpinner.setValue(4.0);
    }

    private JPanel statusPill() {
        JPanel pill = new JPanel(new FlowLayout(FlowLayout.CENTER, 10, 0)) {
            @Override
            protected void paintComponent(Graphics g) {
                Graphics2D g2 = (Graphics2D) g.create();
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                g2.setColor(new Color(5, 10, 10, 155));
                g2.fillRoundRect(0, 0, getWidth(), getHeight(), 24, 24);
                g2.setColor(new Color(123, 225, 183, 72));
                g2.drawRoundRect(0, 0, getWidth() - 1, getHeight() - 1, 24, 24);
                g2.dispose();
                super.paintComponent(g);
            }
        };
        pill.setOpaque(false);
        pill.setPreferredSize(new Dimension(118, 32));
        statusLabel.setForeground(ACCENT);
        statusLabel.setFont(new Font("Segoe UI", Font.BOLD, 12));
        pill.add(statusLabel);
        return pill;
    }

    private GridBagConstraints baseGbc() {
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(7, 7, 7, 7);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.anchor = GridBagConstraints.WEST;
        return gbc;
    }

    private void addSectionTitle(JPanel panel, GridBagConstraints gbc, int row, String title, String subtitle) {
        JPanel text = new JPanel(new GridBagLayout());
        text.setOpaque(false);
        GridBagConstraints tgbc = new GridBagConstraints();
        tgbc.gridx = 0;
        tgbc.gridy = 0;
        tgbc.anchor = GridBagConstraints.WEST;
        JLabel titleLabel = new JLabel(title);
        titleLabel.setForeground(INK);
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 17));
        text.add(titleLabel, tgbc);
        tgbc.gridy = 1;
        JLabel subtitleLabel = new JLabel(subtitle);
        subtitleLabel.setForeground(MUTED);
        subtitleLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        text.add(subtitleLabel, tgbc);

        gbc.gridx = 0;
        gbc.gridy = row;
        gbc.gridwidth = 4;
        gbc.weightx = 1;
        panel.add(text, gbc);
    }

    private void addFormLabel(JPanel panel, GridBagConstraints gbc, int row, String text) {
        addFormLabel(panel, gbc, row, text, 0);
    }

    private void addFormLabel(JPanel panel, GridBagConstraints gbc, int row, String text, int col) {
        gbc.gridx = col;
        gbc.gridy = row;
        gbc.gridwidth = 1;
        gbc.weightx = 0;
        JLabel label = new JLabel(text);
        label.setForeground(new Color(194, 213, 202));
        label.setFont(new Font("Segoe UI", Font.BOLD, 12));
        panel.add(label, gbc);
    }

    private void addFormComponent(JPanel panel, GridBagConstraints gbc, int row, int col, int width, Component component) {
        gbc.gridx = col;
        gbc.gridy = row;
        gbc.gridwidth = width;
        gbc.weightx = 1;
        panel.add(component, gbc);
    }

    private JPanel transparentFlow(int alignment) {
        JPanel panel = new JPanel(new FlowLayout(alignment, 10, 0));
        panel.setOpaque(false);
        return panel;
    }

    private JLabel smallLabel(String text) {
        JLabel label = new JLabel(text);
        label.setForeground(MUTED);
        label.setFont(new Font("Segoe UI", Font.BOLD, 12));
        return label;
    }

    private void styleField(JTextField field) {
        field.setBorder(javax.swing.BorderFactory.createCompoundBorder(
                javax.swing.BorderFactory.createLineBorder(new Color(123, 225, 183, 60)),
                new EmptyBorder(8, 10, 8, 10)
        ));
        field.setBackground(FIELD_BG);
        field.setForeground(INK);
        field.setCaretColor(ACCENT);
        field.setFont(new Font("Segoe UI", Font.PLAIN, 13));
    }

    private void styleCombo(JComboBox<String> combo) {
        combo.setBackground(FIELD_BG);
        combo.setForeground(INK);
        combo.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        combo.setBorder(javax.swing.BorderFactory.createLineBorder(new Color(123, 225, 183, 60)));
    }

    private void styleSpinner(JSpinner spinner) {
        spinner.setPreferredSize(new Dimension(88, 34));
        Component editor = spinner.getEditor();
        if (editor instanceof JSpinner.DefaultEditor) {
            JTextField field = ((JSpinner.DefaultEditor) editor).getTextField();
            styleField(field);
            field.setHorizontalAlignment(SwingConstants.CENTER);
        }
    }

    private void styleCheckBox(JCheckBox box) {
        box.setOpaque(false);
        box.setForeground(INK);
        box.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        box.setFocusPainted(false);
    }

    private void installLightCursor() {
        BufferedImage image = new BufferedImage(28, 28, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2 = image.createGraphics();
        g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2.setColor(new Color(245, 244, 232, 235));
        g2.fill(new Ellipse2D.Double(5, 5, 12, 12));
        g2.fill(new Ellipse2D.Double(11, 3, 13, 13));
        g2.fill(new Ellipse2D.Double(13, 12, 11, 11));
        g2.setColor(new Color(42, 30, 18, 230));
        g2.setStroke(new BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g2.drawLine(7, 20, 2, 26);
        g2.setColor(new Color(123, 225, 183, 220));
        g2.fillOval(21, 7, 4, 4);
        g2.dispose();
        Cursor cursor = Toolkit.getDefaultToolkit().createCustomCursor(image, new Point(6, 6), "cotton-cursor");
        setCursor(cursor);
    }

    private void openPath(Path path) {
        try {
            Files.createDirectories(path);
            Desktop.getDesktop().open(path.toFile());
        } catch (IOException ex) {
            showError("Nao consegui abrir: " + path + "\n" + ex.getMessage());
        }
    }

    private void appendLog(String message) {
        String time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        logArea.append("[" + time + "] " + message + "\n");
        logArea.setCaretPosition(logArea.getDocument().getLength());
    }

    private void showError(String message) {
        JOptionPane.showMessageDialog(this, message, "RobloxCube", JOptionPane.ERROR_MESSAGE);
    }

    private static class QueueItem {
        final String name;
        final String prompt;
        final double resolution;
        final double x;
        final double y;
        final double z;
        final boolean postprocess;
        String status = "Aguardando";
        long startedAt = 0L;
        long durationMs = 0L;

        QueueItem(String name, String prompt, double resolution, double x, double y, double z, boolean postprocess) {
            this.name = name;
            this.prompt = prompt;
            this.resolution = resolution;
            this.x = x;
            this.y = y;
            this.z = z;
            this.postprocess = postprocess;
        }

        @Override
        public String toString() {
            return status + " - " + name;
        }
    }

    private static class QueueCellRenderer extends DefaultListCellRenderer {
        @Override
        public Component getListCellRendererComponent(JList<?> list, Object value, int index, boolean isSelected, boolean cellHasFocus) {
            JLabel label = (JLabel) super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus);
            label.setBorder(new EmptyBorder(8, 10, 8, 10));
            label.setForeground(INK);
            label.setBackground(isSelected ? new Color(53, 83, 72) : new Color(12, 19, 19));
            label.setOpaque(true);
            if (value instanceof QueueItem) {
                QueueItem item = (QueueItem) value;
                label.setText((index + 1) + ". " + item.status + " | " + item.name);
                if ("Gerando".equals(item.status)) {
                    label.setForeground(ACCENT_2);
                } else if ("Concluido".equals(item.status)) {
                    label.setForeground(ACCENT);
                } else if ("Erro".equals(item.status) || "Parado".equals(item.status)) {
                    label.setForeground(new Color(255, 140, 122));
                }
            }
            return label;
        }
    }

    private static class Preview3DPanel extends JPanel {
        private double angle = 0.0;
        private String shape = "Fardo";
        private String material = "Algodao quente";
        private final Timer timer;

        Preview3DPanel() {
            setOpaque(false);
            timer = new Timer(33, e -> {
                angle += 0.035;
                repaint();
            });
        }

        void setActive(boolean active) {
            if (active && !timer.isRunning()) {
                timer.start();
            } else if (!active && timer.isRunning()) {
                timer.stop();
            }
            repaint();
        }

        void setShape(String shape) {
            this.shape = shape;
            repaint();
        }

        void setMaterial(String material) {
            this.material = material;
            repaint();
        }

        Color getMaterialColor() {
            if ("Algodao limpo".equals(material)) return new Color(238, 238, 228);
            if ("Juta / faixa".equals(material)) return new Color(159, 122, 75);
            if ("Metal verde".equals(material)) return new Color(108, 163, 143);
            if ("Borracha escura".equals(material)) return new Color(20, 22, 21);
            return new Color(222, 215, 194);
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int w = getWidth();
            int h = getHeight();
            g2.setColor(new Color(5, 9, 10, 180));
            g2.fillRoundRect(0, 0, w, h, 22, 22);
            drawGrid(g2, w, h);
            if ("Algodao".equals(shape)) {
                drawCotton(g2, w, h);
            } else if ("Maquina".equals(shape)) {
                drawMachine(g2, w, h);
            } else {
                drawBale(g2, w, h);
            }
            g2.setColor(new Color(180, 205, 192));
            g2.setFont(new Font("Segoe UI", Font.BOLD, 13));
            g2.drawString("30 FPS local preview | Material: " + material, 18, 28);
            g2.dispose();
        }

        private void drawGrid(Graphics2D g2, int w, int h) {
            g2.setStroke(new BasicStroke(1f));
            g2.setColor(new Color(123, 225, 183, 28));
            int horizon = (int) (h * 0.68);
            for (int i = -8; i <= 8; i++) {
                int x = w / 2 + i * 42;
                g2.drawLine(x, horizon, w / 2 + i * 90, h);
            }
            for (int y = horizon; y < h; y += 32) {
                g2.drawLine(0, y, w, y);
            }
        }

        private void drawBale(Graphics2D g2, int w, int h) {
            Color base = getMaterialColor();
            int cx = w / 2;
            int cy = h / 2 + 20;
            double s = Math.sin(angle);
            int frontW = 230 + (int) (s * 22);
            int sideW = 92 - (int) (s * 18);
            Path2D side = new Path2D.Double();
            side.moveTo(cx + frontW / 2, cy - 85);
            side.lineTo(cx + frontW / 2 + sideW, cy - 52);
            side.lineTo(cx + frontW / 2 + sideW, cy + 70);
            side.lineTo(cx + frontW / 2, cy + 88);
            side.closePath();
            g2.setColor(shade(base, 0.72));
            g2.fill(side);
            g2.setColor(base);
            g2.fillRoundRect(cx - frontW / 2, cy - 85, frontW, 172, 30, 30);
            g2.setColor(new Color(154, 115, 70));
            g2.fillRoundRect(cx - 72, cy - 102, 18, 204, 12, 12);
            g2.fillRoundRect(cx + 58, cy - 102, 18, 204, 12, 12);
            g2.setColor(new Color(255, 255, 255, 45));
            g2.fillRoundRect(cx - frontW / 2 + 16, cy - 72, frontW - 32, 42, 26, 26);
        }

        private void drawCotton(Graphics2D g2, int w, int h) {
            Color base = getMaterialColor();
            int cx = w / 2;
            int cy = h / 2;
            double bob = Math.sin(angle * 1.3) * 5;
            g2.setColor(new Color(93, 62, 37));
            g2.setStroke(new BasicStroke(14, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            g2.drawLine(cx - 150, cy + 92, cx - 36, cy + 32);
            int[][] lobes = {{-40, -10, 82}, {34, -42, 92}, {82, 26, 82}, {-6, 58, 78}, {-78, 38, 70}};
            for (int[] l : lobes) {
                g2.setColor(shade(base, 0.9 + (l[0] % 3) * 0.04));
                g2.fillOval(cx + l[0] - l[2] / 2, (int) (cy + l[1] + bob) - l[2] / 2, l[2], l[2]);
            }
            g2.setColor(new Color(75, 72, 38));
            for (int i = 0; i < 5; i++) {
                double a = angle + i * Math.PI * 2 / 5;
                int x = cx + (int) Math.round(Math.cos(a) * 38);
                int y = cy + (int) Math.round(Math.sin(a) * 34);
                Path2D leaf = new Path2D.Double();
                leaf.moveTo(cx, cy + 20);
                leaf.lineTo(x, y);
                leaf.lineTo(cx + (int) Math.round(Math.cos(a + 0.4) * 24), cy + (int) Math.round(Math.sin(a + 0.4) * 26));
                leaf.closePath();
                g2.fill(leaf);
            }
        }

        private void drawMachine(Graphics2D g2, int w, int h) {
            Color base = getMaterialColor();
            int cx = w / 2;
            int cy = h / 2 + 26;
            int offset = (int) (Math.sin(angle) * 24);
            g2.setColor(shade(base, 0.75));
            g2.fillRoundRect(cx - 185 + offset / 4, cy - 10, 350, 120, 28, 28);
            g2.setColor(base);
            g2.fillRoundRect(cx - 120 - offset / 4, cy - 132, 220, 92, 24, 24);
            g2.setColor(new Color(15, 18, 18));
            g2.fillRoundRect(cx - 110, cy - 34, 250, 28, 24, 24);
            g2.fillRoundRect(cx - 70, cy + 28, 250, 28, 24, 24);
            g2.setColor(new Color(178, 182, 176));
            g2.fillRoundRect(cx + 84, cy - 4, 148, 58, 16, 16);
            g2.setColor(new Color(222, 215, 194));
            g2.fillRoundRect(cx + 182, cy + 56, 92, 28, 14, 14);
        }

        private Color shade(Color c, double f) {
            return new Color(
                    Math.max(0, Math.min(255, (int) (c.getRed() * f))),
                    Math.max(0, Math.min(255, (int) (c.getGreen() * f))),
                    Math.max(0, Math.min(255, (int) (c.getBlue() * f)))
            );
        }
    }

    private static class AnimatedBackgroundPanel extends JPanel {
        private float phase = 0f;

        AnimatedBackgroundPanel() {
            setOpaque(false);
            Timer timer = new Timer(250, e -> {
                phase += 0.08f;
                repaint();
            });
            timer.start();
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int w = getWidth();
            int h = getHeight();
            float pulse = (float) ((Math.sin(phase) + 1.0) * 0.5);
            Color top = blend(new Color(12, 24, 28), new Color(21, 42, 36), pulse);
            Color bottom = blend(new Color(8, 10, 13), new Color(30, 24, 18), 1f - pulse);
            g2.setPaint(new GradientPaint(0, 0, top, w, h, bottom));
            g2.fillRoundRect(0, 0, w, h, 28, 28);
            drawOrb(g2, w * 0.13, h * 0.22, 210 + 24 * Math.sin(phase * 1.5), new Color(123, 225, 183, 45));
            drawOrb(g2, w * 0.88, h * 0.18, 240 + 30 * Math.cos(phase * 1.2), new Color(235, 206, 134, 42));
            g2.dispose();
            super.paintComponent(g);
        }

        private void drawOrb(Graphics2D g2, double x, double y, double radius, Color color) {
            Color transparent = new Color(color.getRed(), color.getGreen(), color.getBlue(), 0);
            g2.setPaint(new java.awt.RadialGradientPaint(new Point((int) x, (int) y), (float) radius, new float[]{0f, 1f}, new Color[]{color, transparent}));
            g2.fill(new Ellipse2D.Double(x - radius, y - radius, radius * 2, radius * 2));
        }

        private static Color blend(Color a, Color b, float amount) {
            float t = Math.max(0f, Math.min(1f, amount));
            int r = Math.round(a.getRed() + (b.getRed() - a.getRed()) * t);
            int g = Math.round(a.getGreen() + (b.getGreen() - a.getGreen()) * t);
            int bl = Math.round(a.getBlue() + (b.getBlue() - a.getBlue()) * t);
            return new Color(r, g, bl);
        }
    }

    private static class GlassPanel extends JPanel {
        private final int arc;
        private final Color fill;

        GlassPanel(int arc, Color fill) {
            this.arc = arc;
            this.fill = fill;
            setOpaque(false);
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int w = getWidth();
            int h = getHeight();
            g2.setColor(new Color(0, 0, 0, 70));
            g2.fillRoundRect(6, 8, w - 12, h - 12, arc, arc);
            g2.setColor(fill);
            g2.fillRoundRect(0, 0, w - 1, h - 1, arc, arc);
            g2.setPaint(new LinearGradientPaint(0, 0, w, h, new float[]{0f, 1f}, new Color[]{new Color(255, 255, 255, 42), new Color(255, 255, 255, 4)}));
            g2.drawRoundRect(0, 0, w - 1, h - 1, arc, arc);
            g2.dispose();
            super.paintComponent(g);
        }
    }

    private static class GlowButton extends JButton {
        private float hover = 0f;
        private final boolean primary;

        GlowButton(String text, boolean primary) {
            super(text);
            this.primary = primary;
            setOpaque(false);
            setContentAreaFilled(false);
            setBorderPainted(false);
            setFocusPainted(false);
            setForeground(primary ? new Color(8, 24, 20) : INK);
            setFont(new Font("Segoe UI", Font.BOLD, 12));
            setBorder(new EmptyBorder(10, 16, 10, 16));
            setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            addMouseListener(new MouseAdapter() {
                @Override
                public void mouseEntered(MouseEvent e) {
                    hover = 1f;
                    repaint();
                }

                @Override
                public void mouseExited(MouseEvent e) {
                    hover = 0f;
                    repaint();
                }
            });
        }

        @Override
        protected void paintComponent(Graphics g) {
            Graphics2D g2 = (Graphics2D) g.create();
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int w = getWidth();
            int h = getHeight();
            float enabledAlpha = isEnabled() ? 1f : 0.45f;
            g2.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, enabledAlpha));
            if (primary) {
                Color a = blend(ACCENT, new Color(202, 255, 228), hover);
                Color b = blend(new Color(82, 180, 145), ACCENT_2, hover * 0.35f);
                g2.setPaint(new GradientPaint(0, 0, a, w, h, b));
            } else {
                Color fill = blend(new Color(18, 29, 29), new Color(38, 58, 52), hover);
                g2.setColor(fill);
            }
            g2.fillRoundRect(0, 0, w, h, 18, 18);
            g2.setColor(primary ? new Color(255, 255, 255, 90) : new Color(123, 225, 183, 70));
            g2.drawRoundRect(0, 0, w - 1, h - 1, 18, 18);
            g2.dispose();
            super.paintComponent(g);
        }

        private static Color blend(Color a, Color b, float amount) {
            float t = Math.max(0f, Math.min(1f, amount));
            int r = Math.round(a.getRed() + (b.getRed() - a.getRed()) * t);
            int g = Math.round(a.getGreen() + (b.getGreen() - a.getGreen()) * t);
            int bl = Math.round(a.getBlue() + (b.getBlue() - a.getBlue()) * t);
            return new Color(r, g, bl);
        }
    }
}
